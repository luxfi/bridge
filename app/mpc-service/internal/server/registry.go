package server

import (
	"sync"
	"time"

	consulapi "github.com/hashicorp/consul/api"
	"github.com/luxfi/mpc/pkg/mpc"
	"github.com/sirupsen/logrus"
)

// SimplePeerRegistry implements mpc.PeerRegistry for bridge use
type SimplePeerRegistry struct {
	peerIDs    []string
	consul     *consulapi.Client
	readyPeers map[string]bool
	mu         sync.RWMutex
	logger     *logrus.Logger
}

func NewSimplePeerRegistry(peerIDs []string, consul *consulapi.Client) mpc.PeerRegistry {
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{})

	return &SimplePeerRegistry{
		peerIDs:    peerIDs,
		consul:     consul,
		readyPeers: make(map[string]bool),
		logger:     logger,
	}
}

func (r *SimplePeerRegistry) WatchPeersReady() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		r.updatePeerStatus()
	}
}

func (r *SimplePeerRegistry) updatePeerStatus() {
	services, _, err := r.consul.Health().Service("bridge-mpc", "", true, nil)
	if err != nil {
		r.logger.Errorf("Failed to check peer status: %v", err)
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Reset ready peers
	r.readyPeers = make(map[string]bool)

	// Mark active peers as ready
	for _, service := range services {
		r.readyPeers[service.Service.ID] = true
	}

	r.logger.Infof("Updated peer status: %d peers ready", len(r.readyPeers))
}

func (r *SimplePeerRegistry) ArePeersReady() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	readyCount := len(r.readyPeers)
	expectedCount := len(r.peerIDs)

	// We're ready if we have at least threshold peers
	// For 3 nodes with threshold 2, we need at least 2 peers ready
	return readyCount >= (expectedCount+1)/2
}

func (r *SimplePeerRegistry) GetReadyPeersCount() int64 {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return int64(len(r.readyPeers))
}

func (r *SimplePeerRegistry) GetTotalPeersCount() int64 {
	return int64(len(r.peerIDs) + 1) // Include self
}

func (r *SimplePeerRegistry) Ready() error {
	// Mark ourselves as ready
	return nil
}

func (r *SimplePeerRegistry) Resign() error {
	// Clean up when shutting down
	return nil
}

func (r *SimplePeerRegistry) GetReadyPeersIncludeSelf() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	peers := make([]string, 0, len(r.readyPeers))
	for peer := range r.readyPeers {
		peers = append(peers, peer)
	}

	return peers
}