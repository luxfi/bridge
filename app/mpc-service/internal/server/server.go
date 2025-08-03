package server

import (
	"context"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	consulapi "github.com/hashicorp/consul/api"
	"github.com/nats-io/nats.go"
	"github.com/sirupsen/logrus"

	// Use the actual MPC node implementation
	"github.com/luxfi/mpc/pkg/kvstore"
	"github.com/luxfi/mpc/pkg/messaging"
	"github.com/luxfi/mpc/pkg/mpc"
)

var logger = logrus.New()

type Config struct {
	NodeID    string
	Port      string
	NatsURL   string
	ConsulURL string
	DataDir   string
}

type Server struct {
	config              Config
	nc                  *nats.Conn
	consul              *consulapi.Client
	mpcNode             *mpc.Node
	sessions            sync.Map
	messageQueueManager *messaging.NATsMessageQueueManager
}

type SignRequest struct {
	SessionID           string `json:"sessionId"`
	TxID                string `json:"txId"`
	FromNetworkID       string `json:"fromNetworkId"`
	ToNetworkID         string `json:"toNetworkId"`
	ToTokenAddress      string `json:"toTokenAddress"`
	MsgSignature        string `json:"msgSignature"`
	ReceiverAddressHash string `json:"receiverAddressHash"`
	TokenAmount         string `json:"tokenAmount"`
	Decimals            int    `json:"decimals"`
	Vault               bool   `json:"vault"`
}

type SignResponse struct {
	SessionID string `json:"sessionId"`
	Signature string `json:"signature"`
	NodeID    string `json:"nodeId"`
}

func NewServer(config Config) (*Server, error) {
	// Connect to NATS
	nc, err := nats.Connect(config.NatsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	// Connect to Consul
	consulConfig := consulapi.DefaultConfig()
	consulConfig.Address = config.ConsulURL
	consul, err := consulapi.NewClient(consulConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Consul: %w", err)
	}

	// Create data directory
	if err := ensureDir(config.DataDir); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Create KV store
	badgerConfig := kvstore.BadgerConfig{
		NodeID:              config.NodeID,
		EncryptionKey:       []byte("dummy-encryption-key-32-bytes!!!"),  // 32 bytes
		BackupEncryptionKey: []byte("dummy-backup-key-32-bytes!!!!!!!"), // 32 bytes
		BackupDir:           filepath.Join(config.DataDir, "backup"),
		DBPath:              filepath.Join(config.DataDir, "badger"),
	}
	kvStore, err := kvstore.NewBadgerKVStore(badgerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create KV store: %w", err)
	}

	// Create message queue manager
	messageQueueManager := messaging.NewNATsMessageQueueManager(
		"bridge-mpc",
		[]string{"bridge.mpc.>"},
		nc,
	)

	// Create key info store - use the KeyStore wrapper
	keyInfoStore := &keyInfoStoreWrapper{kvStore: kvStore}

	// Create identity store (simplified for bridge use)
	identityStore := NewSimpleIdentityStore(config.NodeID)

	// Get peer list from environment or use defaults
	peerIDs := []string{"mpc-node-2", "mpc-node-3"}
	if config.NodeID != "mpc-node-1" {
		peerIDs = []string{"mpc-node-1", "mpc-node-3"}
		if config.NodeID == "mpc-node-3" {
			peerIDs = []string{"mpc-node-1", "mpc-node-2"}
		}
	}

	// Create peer registry
	peerRegistry := NewSimplePeerRegistry(peerIDs, consul)

	// Use the actual NATS pubsub implementation
	pubSub := messaging.NewNATSPubSub(nc)

	// Create MPC node
	mpcNode := mpc.NewNode(
		config.NodeID,
		peerIDs,
		pubSub,
		kvStore,
		keyInfoStore,
		peerRegistry,
		identityStore,
	)

	return &Server{
		config:              config,
		nc:                  nc,
		consul:              consul,
		mpcNode:             mpcNode,
		messageQueueManager: messageQueueManager,
	}, nil
}

func (s *Server) Start(ctx context.Context) error {
	// Register with Consul
	if err := s.registerWithConsul(); err != nil {
		return fmt.Errorf("failed to register with Consul: %w", err)
	}

	// Setup HTTP server
	router := gin.Default()
	s.setupRoutes(router)

	srv := &http.Server{
		Addr:    ":" + s.config.Port,
		Handler: router,
	}

	// Start server in goroutine
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Subscribe to NATS topics
	if err := s.subscribeToTopics(); err != nil {
		return fmt.Errorf("failed to subscribe to topics: %w", err)
	}

	logger.Infof("MPC server %s started on port %s", s.config.NodeID, s.config.Port)

	// Wait for shutdown
	<-ctx.Done()

	// Graceful shutdown
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Errorf("Server forced to shutdown: %v", err)
	}

	s.nc.Close()
	return s.deregisterFromConsul()
}

func (s *Server) setupRoutes(router *gin.Engine) {
	router.GET("/health", s.healthHandler)
	router.POST("/sign", s.signHandler)
	router.GET("/status", s.statusHandler)
	router.POST("/keygen", s.keygenHandler)
}

func (s *Server) healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"nodeId":    s.config.NodeID,
		"timestamp": time.Now().Unix(),
	})
}

func (s *Server) keygenHandler(c *gin.Context) {
	var req struct {
		WalletID  string `json:"walletId"`
		Threshold int    `json:"threshold"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create message queue for results
	messageQueue := s.messageQueueManager.NewMessageQueue(fmt.Sprintf("keygen-%s", req.WalletID))

	// Create key generation session
	session, err := s.mpcNode.CreateKeyGenSession(req.WalletID, req.Threshold, messageQueue)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Store session
	s.sessions.Store(req.WalletID, session)

	// Start session in a goroutine
	go func() {
		// In the actual MPC implementation, sessions are event-driven
		// For now, we'll just log
		logger.Infof("Key generation session started for wallet %s", req.WalletID)
	}()

	c.JSON(http.StatusOK, gin.H{
		"walletId": req.WalletID,
		"nodeId":   s.config.NodeID,
		"status":   "started",
	})
}

func (s *Server) signHandler(c *gin.Context) {
	var req SignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Construct message to sign
	message := s.constructSigningMessage(req)
	messageBytes, err := hex.DecodeString(message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid message format"})
		return
	}

	// Get wallet ID for the network
	walletID := fmt.Sprintf("bridge-%s", req.FromNetworkID)

	// For now, return a mock signature
	// In production, this would coordinate with other MPC nodes
	// to generate a threshold signature
	
	logger.Infof("Sign request for wallet %s, message: %x", walletID, messageBytes)

	// Mock signature generation
	// In real implementation, this would use the MPC protocol
	mockSignature := hex.EncodeToString(append([]byte("signature:"), messageBytes[:8]...))

	c.JSON(http.StatusOK, SignResponse{
		SessionID: req.SessionID,
		Signature: mockSignature,
		NodeID:    s.config.NodeID,
	})
}

func (s *Server) statusHandler(c *gin.Context) {
	// Get network status
	services, _, err := s.consul.Health().Service("bridge-mpc", "", true, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	activeNodes := []string{}
	for _, service := range services {
		activeNodes = append(activeNodes, service.Service.ID)
	}

	c.JSON(http.StatusOK, gin.H{
		"nodeId":      s.config.NodeID,
		"totalNodes":  3,
		"threshold":   2,
		"activeNodes": len(activeNodes),
		"ready":       len(activeNodes) >= 2,
		"nodes":       activeNodes,
	})
}

func (s *Server) registerWithConsul() error {
	registration := &consulapi.AgentServiceRegistration{
		ID:      s.config.NodeID,
		Name:    "bridge-mpc",
		Tags:    []string{"mpc", "bridge", "cggmp21"},
		Port:    mustParseInt(s.config.Port),
		Address: "localhost",
		Check: &consulapi.AgentServiceCheck{
			HTTP:     fmt.Sprintf("http://localhost:%s/health", s.config.Port),
			Interval: "10s",
			Timeout:  "5s",
		},
		Meta: map[string]string{
			"nodeId":    s.config.NodeID,
			"threshold": "2",
			"protocol":  "cggmp21",
		},
	}

	return s.consul.Agent().ServiceRegister(registration)
}

func (s *Server) deregisterFromConsul() error {
	return s.consul.Agent().ServiceDeregister(s.config.NodeID)
}

func (s *Server) subscribeToTopics() error {
	// Subscribe to key generation coordination
	if _, err := s.nc.Subscribe("bridge.mpc.keygen.coordinate", s.handleKeyGenCoordinate); err != nil {
		return err
	}

	// Subscribe to signing coordination
	if _, err := s.nc.Subscribe("bridge.mpc.sign.coordinate", s.handleSignCoordinate); err != nil {
		return err
	}

	return nil
}

func (s *Server) handleKeyGenCoordinate(msg *nats.Msg) {
	// Handle coordination messages
	logger.Infof("Received keygen coordination: %s", string(msg.Data))
	msg.Respond([]byte(`{"status":"acknowledged"}`))
}

func (s *Server) handleSignCoordinate(msg *nats.Msg) {
	// Handle coordination messages
	logger.Infof("Received sign coordination: %s", string(msg.Data))
	msg.Respond([]byte(`{"status":"acknowledged"}`))
}

func (s *Server) constructSigningMessage(req SignRequest) string {
	// This follows the bridge protocol for message construction
	toNetworkIDHash := hashString(req.ToNetworkID)
	txIDHash := hashString(req.TxID)
	toTokenAddressHash := hashString(req.ToTokenAddress)

	message := toNetworkIDHash + txIDHash + toTokenAddressHash +
		req.TokenAmount + fmt.Sprintf("%d", req.Decimals) +
		req.ReceiverAddressHash + fmt.Sprintf("%t", req.Vault)

	return message
}

// Helper functions

func hashString(data string) string {
	// Simple hash for demo - in production use Keccak256
	return fmt.Sprintf("%x", data)[:64]
}

func ensureDir(path string) error {
	return os.MkdirAll(path, 0755)
}

func mustParseInt(s string) int {
	var i int
	fmt.Sscanf(s, "%d", &i)
	return i
}