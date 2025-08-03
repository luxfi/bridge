package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	consulapi "github.com/hashicorp/consul/api"
	"github.com/luxfi/mpc/pkg/protocol"
	"github.com/luxfi/mpc/pkg/protocol/cggmp21"
	"github.com/luxfi/mpc/pkg/protocol/frost"
	"github.com/nats-io/nats.go"
	"github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

var logger = logrus.New()

type Config struct {
	NodeID      string `mapstructure:"NODE_ID"`
	NodePort    string `mapstructure:"NODE_PORT"`
	NATSUrl     string `mapstructure:"NATS_URL"`
	ConsulUrl   string `mapstructure:"CONSUL_URL"`
	Threshold   int    `mapstructure:"MPC_THRESHOLD"`
	TotalNodes  int    `mapstructure:"MPC_TOTAL_NODES"`
	KeyPrefix   string `mapstructure:"MPC_KEY_PREFIX"`
	ChainType   string `mapstructure:"CHAIN_TYPE"` // "ecdsa" or "eddsa"
}

type MPCNode struct {
	config         Config
	nc             *nats.Conn
	consul         *consulapi.Client
	protocolEngine protocol.Engine
	partyID        string
	shares         sync.Map // Store key shares
	sessions       sync.Map // Active signing sessions
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
	ChainType           string `json:"chainType"` // "ecdsa" or "eddsa"
}

type SignResponse struct {
	SessionID   string   `json:"sessionId"`
	Signature   string   `json:"signature"`
	NodeID      string   `json:"nodeId"`
	Participants []string `json:"participants"`
}

func NewMPCNode(config Config) (*MPCNode, error) {
	// Connect to NATS
	nc, err := nats.Connect(config.NATSUrl)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	// Connect to Consul
	consulConfig := consulapi.DefaultConfig()
	consulConfig.Address = config.ConsulUrl
	consul, err := consulapi.NewClient(consulConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Consul: %w", err)
	}

	// Initialize protocol engine based on chain type
	var engine protocol.Engine
	switch config.ChainType {
	case "ecdsa":
		engine = cggmp21.NewEngine()
	case "eddsa":
		engine = frost.NewEngine()
	default:
		engine = cggmp21.NewEngine() // Default to ECDSA
	}

	node := &MPCNode{
		config:         config,
		nc:             nc,
		consul:         consul,
		protocolEngine: engine,
		partyID:        config.NodeID,
	}

	return node, nil
}

func (n *MPCNode) Start(ctx context.Context) error {
	// Register with Consul
	if err := n.registerWithConsul(); err != nil {
		return fmt.Errorf("failed to register with Consul: %w", err)
	}

	// Start HTTP server
	router := gin.Default()
	n.setupRoutes(router)

	srv := &http.Server{
		Addr:    ":" + n.config.NodePort,
		Handler: router,
	}

	// Start server in goroutine
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Subscribe to NATS topics
	if err := n.subscribeToTopics(); err != nil {
		return fmt.Errorf("failed to subscribe to topics: %w", err)
	}

	// Initialize or recover key shares
	if err := n.initializeKeyShares(); err != nil {
		return fmt.Errorf("failed to initialize key shares: %w", err)
	}

	logger.Infof("MPC node %s started on port %s", n.config.NodeID, n.config.NodePort)

	// Wait for shutdown signal
	<-ctx.Done()

	// Graceful shutdown
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Errorf("Server forced to shutdown: %v", err)
	}

	n.nc.Close()
	return n.deregisterFromConsul()
}

func (n *MPCNode) setupRoutes(router *gin.Engine) {
	router.GET("/health", n.healthHandler)
	router.POST("/sign", n.signHandler)
	router.GET("/status", n.statusHandler)
}

func (n *MPCNode) healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"nodeId":    n.config.NodeID,
		"timestamp": time.Now().Unix(),
	})
}

func (n *MPCNode) signHandler(c *gin.Context) {
	var req SignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Process signing request
	signature, err := n.processSignRequest(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, SignResponse{
		SessionID: req.SessionID,
		Signature: signature,
		NodeID:    n.config.NodeID,
	})
}

func (n *MPCNode) statusHandler(c *gin.Context) {
	// Get network status
	services, _, err := n.consul.Health().Service("bridge-mpc", "", true, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	activeNodes := []string{}
	for _, service := range services {
		activeNodes = append(activeNodes, service.Service.ID)
	}

	c.JSON(http.StatusOK, gin.H{
		"nodeId":      n.config.NodeID,
		"totalNodes":  n.config.TotalNodes,
		"threshold":   n.config.Threshold,
		"activeNodes": len(activeNodes),
		"ready":       len(activeNodes) >= n.config.Threshold,
		"nodes":       activeNodes,
	})
}

func (n *MPCNode) registerWithConsul() error {
	registration := &consulapi.AgentServiceRegistration{
		ID:      n.config.NodeID,
		Name:    "bridge-mpc",
		Tags:    []string{"mpc", "bridge", n.config.ChainType},
		Port:    mustParseInt(n.config.NodePort),
		Address: getLocalIP(),
		Check: &consulapi.AgentServiceCheck{
			HTTP:     fmt.Sprintf("http://localhost:%s/health", n.config.NodePort),
			Interval: "10s",
			Timeout:  "5s",
		},
		Meta: map[string]string{
			"nodeId":     n.config.NodeID,
			"threshold":  fmt.Sprintf("%d", n.config.Threshold),
			"totalNodes": fmt.Sprintf("%d", n.config.TotalNodes),
			"chainType":  n.config.ChainType,
		},
	}

	return n.consul.Agent().ServiceRegister(registration)
}

func (n *MPCNode) deregisterFromConsul() error {
	return n.consul.Agent().ServiceDeregister(n.config.NodeID)
}

func (n *MPCNode) subscribeToTopics() error {
	// Subscribe to key generation requests
	if _, err := n.nc.Subscribe("bridge.mpc.keygen.request", n.handleKeyGenRequest); err != nil {
		return fmt.Errorf("failed to subscribe to keygen requests: %w", err)
	}

	// Subscribe to signing requests
	if _, err := n.nc.Subscribe("bridge.mpc.sign.request", n.handleSignRequest); err != nil {
		return fmt.Errorf("failed to subscribe to sign requests: %w", err)
	}

	// Subscribe to resharing requests
	if _, err := n.nc.Subscribe("bridge.mpc.reshare.request", n.handleReshareRequest); err != nil {
		return fmt.Errorf("failed to subscribe to reshare requests: %w", err)
	}

	return nil
}

func (n *MPCNode) handleKeyGenRequest(msg *nats.Msg) {
	logger.Infof("Received key generation request")

	// Parse request
	var req struct {
		SessionID string   `json:"sessionId"`
		Parties   []string `json:"parties"`
		Threshold int      `json:"threshold"`
		ChainType string   `json:"chainType"`
	}
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		logger.Errorf("Failed to parse keygen request: %v", err)
		return
	}

	// Check if we're included in the parties
	included := false
	for _, party := range req.Parties {
		if party == n.partyID {
			included = true
			break
		}
	}
	if !included {
		return
	}

	// Create appropriate protocol adapter
	var adapter protocol.Adapter
	switch req.ChainType {
	case "eddsa":
		adapter = frost.NewAdapter(n.partyID, req.Parties, req.Threshold)
	default:
		adapter = cggmp21.NewAdapter(n.partyID, req.Parties, req.Threshold)
	}

	// Run key generation
	ctx := context.Background()
	result, err := n.protocolEngine.KeyGen(ctx, adapter)
	if err != nil {
		logger.Errorf("Key generation failed: %v", err)
		n.publishKeyGenResult(req.SessionID, false, "")
		return
	}

	// Store the key share
	n.shares.Store(req.SessionID, result)

	// Store in Consul
	if err := n.storeKeyShareInConsul(req.SessionID, result); err != nil {
		logger.Errorf("Failed to store key share in Consul: %v", err)
	}

	// Publish success
	n.publishKeyGenResult(req.SessionID, true, result.PublicKey)
}

func (n *MPCNode) handleSignRequest(msg *nats.Msg) {
	var req SignRequest
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		logger.Errorf("Failed to parse sign request: %v", err)
		return
	}

	logger.Infof("Processing sign request for session %s", req.SessionID)

	// Process the signing request
	signature, err := n.processSignRequest(req)
	if err != nil {
		logger.Errorf("Signing failed: %v", err)
		return
	}

	// Publish signature
	response := SignResponse{
		SessionID: req.SessionID,
		Signature: signature,
		NodeID:    n.config.NodeID,
	}

	responseData, _ := json.Marshal(response)
	n.nc.Publish("bridge.mpc.sign.response", responseData)
}

func (n *MPCNode) handleReshareRequest(msg *nats.Msg) {
	logger.Infof("Received reshare request")

	var req struct {
		SessionID    string   `json:"sessionId"`
		OldParties   []string `json:"oldParties"`
		NewParties   []string `json:"newParties"`
		NewThreshold int      `json:"newThreshold"`
		ChainType    string   `json:"chainType"`
	}
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		logger.Errorf("Failed to parse reshare request: %v", err)
		return
	}

	// Get existing key share
	shareData, ok := n.shares.Load(req.SessionID)
	if !ok {
		logger.Errorf("No key share found for session %s", req.SessionID)
		return
	}

	keyShare := shareData.(*protocol.KeyGenResult)

	// Create appropriate adapter
	var adapter protocol.ReshareAdapter
	switch req.ChainType {
	case "eddsa":
		adapter = frost.NewReshareAdapter(n.partyID, req.OldParties, req.NewParties, req.NewThreshold, keyShare)
	default:
		adapter = cggmp21.NewReshareAdapter(n.partyID, req.OldParties, req.NewParties, req.NewThreshold, keyShare)
	}

	// Run resharing
	ctx := context.Background()
	newShare, err := n.protocolEngine.Reshare(ctx, adapter)
	if err != nil {
		logger.Errorf("Resharing failed: %v", err)
		return
	}

	// Store new share
	n.shares.Store(req.SessionID+"-new", newShare)

	// Publish success
	n.nc.Publish("bridge.mpc.reshare.response", []byte(fmt.Sprintf(`{"sessionId":"%s","nodeId":"%s","success":true}`, req.SessionID, n.config.NodeID)))
}

func (n *MPCNode) processSignRequest(req SignRequest) (string, error) {
	// Construct message to sign
	message := n.constructSigningMessage(req)
	messageBytes, err := hex.DecodeString(message)
	if err != nil {
		return "", fmt.Errorf("failed to decode message: %w", err)
	}

	// Get key share for the appropriate chain
	shareKey := fmt.Sprintf("%s-%s", req.ChainType, req.FromNetworkID)
	shareData, ok := n.shares.Load(shareKey)
	if !ok {
		return "", fmt.Errorf("no key share found for %s", shareKey)
	}

	keyShare := shareData.(*protocol.KeyGenResult)

	// Get active parties from Consul
	parties, err := n.getActiveParties()
	if err != nil {
		return "", fmt.Errorf("failed to get active parties: %w", err)
	}

	// Create signing adapter
	var adapter protocol.SignAdapter
	switch req.ChainType {
	case "eddsa":
		adapter = frost.NewSignAdapter(n.partyID, parties, keyShare, messageBytes)
	default:
		adapter = cggmp21.NewSignAdapter(n.partyID, parties, keyShare, messageBytes)
	}

	// Run signing protocol
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	signature, err := n.protocolEngine.Sign(ctx, adapter)
	if err != nil {
		return "", fmt.Errorf("signing failed: %w", err)
	}

	return hex.EncodeToString(signature), nil
}

func (n *MPCNode) constructSigningMessage(req SignRequest) string {
	// This follows the bridge protocol for message construction
	// Convert to hex and concatenate as per the original implementation
	toNetworkIDHash := hashKeccak256(req.ToNetworkID)
	txIDHash := hashKeccak256(req.TxID)
	toTokenAddressHash := hashKeccak256(req.ToTokenAddress)

	message := toNetworkIDHash + txIDHash + toTokenAddressHash + 
		req.TokenAmount + fmt.Sprintf("%d", req.Decimals) + 
		req.ReceiverAddressHash + fmt.Sprintf("%t", req.Vault)

	return message
}

func (n *MPCNode) initializeKeyShares() error {
	// Try to recover existing key shares from Consul
	kvPairs, _, err := n.consul.KV().List(n.config.KeyPrefix+"/shares/"+n.config.NodeID, nil)
	if err != nil {
		return fmt.Errorf("failed to list key shares: %w", err)
	}

	for _, kv := range kvPairs {
		var keyShare protocol.KeyGenResult
		if err := json.Unmarshal(kv.Value, &keyShare); err != nil {
			logger.Errorf("Failed to unmarshal key share: %v", err)
			continue
		}

		// Extract session ID from key path
		sessionID := extractSessionID(kv.Key)
		n.shares.Store(sessionID, &keyShare)
		logger.Infof("Recovered key share for session %s", sessionID)
	}

	return nil
}

func (n *MPCNode) storeKeyShareInConsul(sessionID string, keyShare *protocol.KeyGenResult) error {
	data, err := json.Marshal(keyShare)
	if err != nil {
		return fmt.Errorf("failed to marshal key share: %w", err)
	}

	key := fmt.Sprintf("%s/shares/%s/%s", n.config.KeyPrefix, n.config.NodeID, sessionID)
	_, err = n.consul.KV().Put(&consulapi.KVPair{
		Key:   key,
		Value: data,
	}, nil)

	return err
}

func (n *MPCNode) getActiveParties() ([]string, error) {
	services, _, err := n.consul.Health().Service("bridge-mpc", "", true, nil)
	if err != nil {
		return nil, err
	}

	parties := make([]string, 0, len(services))
	for _, service := range services {
		parties = append(parties, service.Service.ID)
	}

	return parties, nil
}

func (n *MPCNode) publishKeyGenResult(sessionID string, success bool, publicKey string) {
	result := map[string]interface{}{
		"sessionId": sessionID,
		"nodeId":    n.config.NodeID,
		"success":   success,
		"publicKey": publicKey,
		"timestamp": time.Now().Unix(),
	}

	data, _ := json.Marshal(result)
	n.nc.Publish("bridge.mpc.keygen.response", data)
}

// Helper functions

func hashKeccak256(data string) string {
	// This would use actual Keccak256 hashing
	// For now, return a placeholder
	return hex.EncodeToString([]byte(data))[:64]
}

func extractSessionID(key string) string {
	// Extract session ID from Consul key path
	parts := []string{}
	for _, part := range []byte(key) {
		parts = append(parts, string(part))
	}
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return "default"
}

func getLocalIP() string {
	// Get local IP address for service registration
	return "localhost"
}

func mustParseInt(s string) int {
	var i int
	fmt.Sscanf(s, "%d", &i)
	return i
}

func loadConfig() (Config, error) {
	viper.SetDefault("NODE_ID", fmt.Sprintf("mpc-node-%d", time.Now().Unix()))
	viper.SetDefault("NODE_PORT", "6000")
	viper.SetDefault("NATS_URL", "nats://localhost:4222")
	viper.SetDefault("CONSUL_URL", "http://localhost:8500")
	viper.SetDefault("MPC_THRESHOLD", 2)
	viper.SetDefault("MPC_TOTAL_NODES", 3)
	viper.SetDefault("MPC_KEY_PREFIX", "bridge/mpc")
	viper.SetDefault("CHAIN_TYPE", "ecdsa")

	viper.AutomaticEnv()

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return config, err
	}

	return config, nil
}

func main() {
	// Setup logger
	logger.SetFormatter(&logrus.JSONFormatter{})
	logger.SetLevel(logrus.InfoLevel)

	// Load configuration
	config, err := loadConfig()
	if err != nil {
		logger.Fatalf("Failed to load config: %v", err)
	}

	// Create MPC node
	node, err := NewMPCNode(config)
	if err != nil {
		logger.Fatalf("Failed to create MPC node: %v", err)
	}

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		logger.Info("Shutting down...")
		cancel()
	}()

	// Start the node
	if err := node.Start(ctx); err != nil {
		logger.Fatalf("Failed to start node: %v", err)
	}

	logger.Info("MPC node stopped")
}