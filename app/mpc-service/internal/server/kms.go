package server

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"time"

	"github.com/luxfi/kms-go/client"
	"github.com/luxfi/kms-go/models"
	"github.com/sirupsen/logrus"
)

// KMSConfig holds configuration for KMS integration
type KMSConfig struct {
	URL          string
	Token        string
	ProjectID    string
	SecretPath   string
	LuxIDURL     string // Lux ID (Casdoor) URL for authentication
	LuxIDClientID string
	LuxIDSecret  string
}

// KMSManager handles all KMS operations for the MPC node
type KMSManager struct {
	client *client.Client
	config KMSConfig
	logger *logrus.Logger
}

// NewKMSManager creates a new KMS manager instance
func NewKMSManager(config KMSConfig) (*KMSManager, error) {
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{})

	// Create KMS client configuration
	clientConfig := client.Config{
		BaseURL:   config.URL,
		ProjectID: config.ProjectID,
		Auth: client.AuthConfig{
			Type:  "token",
			Token: config.Token,
		},
	}

	// If Lux ID credentials are provided, use machine identity auth
	if config.LuxIDClientID != "" && config.LuxIDSecret != "" {
		clientConfig.Auth = client.AuthConfig{
			Type:         "machine-identity",
			ClientID:     config.LuxIDClientID,
			ClientSecret: config.LuxIDSecret,
		}
	}

	// Create KMS client
	kmsClient, err := client.NewClient(clientConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create KMS client: %w", err)
	}

	return &KMSManager{
		client: kmsClient,
		config: config,
		logger: logger,
	}, nil
}

// StoreNodeKey stores the MPC node's key share in KMS
func (k *KMSManager) StoreNodeKey(ctx context.Context, nodeID string, keyShare []byte) error {
	secretName := fmt.Sprintf("%s/%s/key-share", k.config.SecretPath, nodeID)
	
	// Encode key share as base64
	encodedKey := base64.StdEncoding.EncodeToString(keyShare)
	
	secret := &models.Secret{
		Name:  secretName,
		Value: encodedKey,
		Type:  "symmetric",
		Metadata: map[string]string{
			"node_id":    nodeID,
			"created_at": time.Now().UTC().Format(time.RFC3339),
			"purpose":    "mpc-key-share",
		},
	}

	err := k.client.CreateSecret(ctx, secret)
	if err != nil {
		return fmt.Errorf("failed to store node key in KMS: %w", err)
	}

	k.logger.Infof("Successfully stored key share for node %s in KMS", nodeID)
	return nil
}

// RetrieveNodeKey retrieves the MPC node's key share from KMS
func (k *KMSManager) RetrieveNodeKey(ctx context.Context, nodeID string) ([]byte, error) {
	secretName := fmt.Sprintf("%s/%s/key-share", k.config.SecretPath, nodeID)
	
	secret, err := k.client.GetSecret(ctx, secretName)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve node key from KMS: %w", err)
	}

	// Decode key share from base64
	keyShare, err := base64.StdEncoding.DecodeString(secret.Value)
	if err != nil {
		return nil, fmt.Errorf("failed to decode key share: %w", err)
	}

	k.logger.Infof("Successfully retrieved key share for node %s from KMS", nodeID)
	return keyShare, nil
}

// StoreSessionKey stores a session-specific key in KMS
func (k *KMSManager) StoreSessionKey(ctx context.Context, sessionID string, key []byte) error {
	secretName := fmt.Sprintf("%s/sessions/%s", k.config.SecretPath, sessionID)
	
	secret := &models.Secret{
		Name:  secretName,
		Value: base64.StdEncoding.EncodeToString(key),
		Type:  "symmetric",
		Metadata: map[string]string{
			"session_id": sessionID,
			"created_at": time.Now().UTC().Format(time.RFC3339),
			"ttl":        "24h", // Session keys expire after 24 hours
		},
	}

	err := k.client.CreateSecret(ctx, secret)
	if err != nil {
		return fmt.Errorf("failed to store session key in KMS: %w", err)
	}

	return nil
}

// RetrieveSessionKey retrieves a session-specific key from KMS
func (k *KMSManager) RetrieveSessionKey(ctx context.Context, sessionID string) ([]byte, error) {
	secretName := fmt.Sprintf("%s/sessions/%s", k.config.SecretPath, sessionID)
	
	secret, err := k.client.GetSecret(ctx, secretName)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve session key from KMS: %w", err)
	}

	key, err := base64.StdEncoding.DecodeString(secret.Value)
	if err != nil {
		return nil, fmt.Errorf("failed to decode session key: %w", err)
	}

	return key, nil
}

// DeleteSessionKey removes a session key from KMS
func (k *KMSManager) DeleteSessionKey(ctx context.Context, sessionID string) error {
	secretName := fmt.Sprintf("%s/sessions/%s", k.config.SecretPath, sessionID)
	
	err := k.client.DeleteSecret(ctx, secretName)
	if err != nil {
		return fmt.Errorf("failed to delete session key from KMS: %w", err)
	}

	return nil
}

// RotateNodeKey rotates the MPC node's key share
func (k *KMSManager) RotateNodeKey(ctx context.Context, nodeID string, newKeyShare []byte) error {
	// Store the old key with a timestamp
	oldSecretName := fmt.Sprintf("%s/%s/key-share-old-%d", k.config.SecretPath, nodeID, time.Now().Unix())
	
	// First, backup the current key
	currentKey, err := k.RetrieveNodeKey(ctx, nodeID)
	if err == nil && currentKey != nil {
		backupSecret := &models.Secret{
			Name:  oldSecretName,
			Value: base64.StdEncoding.EncodeToString(currentKey),
			Type:  "symmetric",
			Metadata: map[string]string{
				"node_id":     nodeID,
				"archived_at": time.Now().UTC().Format(time.RFC3339),
				"purpose":     "mpc-key-share-backup",
			},
		}
		_ = k.client.CreateSecret(ctx, backupSecret) // Ignore error for backup
	}

	// Store the new key
	return k.StoreNodeKey(ctx, nodeID, newKeyShare)
}

// GetKMSConfigFromEnv loads KMS configuration from environment variables
func GetKMSConfigFromEnv() KMSConfig {
	return KMSConfig{
		URL:           getEnvOrDefault("KMS_URL", "http://localhost:8200"),
		Token:         os.Getenv("KMS_TOKEN"),
		ProjectID:     getEnvOrDefault("KMS_PROJECT_ID", "mpc-bridge"),
		SecretPath:    getEnvOrDefault("KMS_SECRET_PATH", "/mpc"),
		LuxIDURL:      getEnvOrDefault("LUXID_URL", "http://localhost:8000"),
		LuxIDClientID: os.Getenv("LUXID_CLIENT_ID"),
		LuxIDSecret:   os.Getenv("LUXID_CLIENT_SECRET"),
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}