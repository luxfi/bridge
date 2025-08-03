package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/luxfi/bridge/mpc-service/internal/server"
	"github.com/sirupsen/logrus"
)

var logger = logrus.New()

func main() {
	// Command line flags
	var (
		nodeID     = flag.String("node-id", getEnvOrDefault("NODE_ID", "mpc-node-1"), "Node ID")
		port       = flag.String("port", getEnvOrDefault("NODE_PORT", "6000"), "HTTP server port")
		natsURL    = flag.String("nats-url", getEnvOrDefault("NATS_URL", "nats://localhost:4222"), "NATS server URL")
		consulURL  = flag.String("consul-url", getEnvOrDefault("CONSUL_URL", "http://localhost:8500"), "Consul server URL")
		dataDir    = flag.String("data-dir", getEnvOrDefault("DATA_DIR", "./data"), "Data directory")
		logLevel   = flag.String("log-level", getEnvOrDefault("LOG_LEVEL", "info"), "Log level")
	)
	flag.Parse()

	// Setup logger
	level, err := logrus.ParseLevel(*logLevel)
	if err != nil {
		logger.Fatalf("Invalid log level: %v", err)
	}
	logger.SetLevel(level)
	logger.SetFormatter(&logrus.JSONFormatter{})

	// Create config
	config := server.Config{
		NodeID:    *nodeID,
		Port:      *port,
		NatsURL:   *natsURL,
		ConsulURL: *consulURL,
		DataDir:   *dataDir,
	}

	// Create and start server
	srv, err := server.NewServer(config)
	if err != nil {
		logger.Fatalf("Failed to create server: %v", err)
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

	// Start server
	logger.Infof("Starting MPC server on port %s", config.Port)
	if err := srv.Start(ctx); err != nil {
		logger.Fatalf("Server error: %v", err)
	}

	logger.Info("Server stopped")
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}