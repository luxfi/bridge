package server

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/luxfi/mpc/pkg/identity"
	"github.com/luxfi/mpc/pkg/types"
)

// SimpleIdentityStore implements identity.Store for bridge use
type SimpleIdentityStore struct {
	nodeID     string
	privateKey []byte
}

func NewSimpleIdentityStore(nodeID string) identity.Store {
	// Generate a random key for this node
	key := make([]byte, 32)
	rand.Read(key)

	return &SimpleIdentityStore{
		nodeID:     nodeID,
		privateKey: key,
	}
}

func (s *SimpleIdentityStore) GetKeyForPeer(peerID string) ([]byte, error) {
	// In production, this would fetch the actual peer's public key
	// For now, return a dummy key
	key := make([]byte, 32)
	copy(key, []byte(peerID))
	return key, nil
}

func (s *SimpleIdentityStore) GetPrivateKey() ([]byte, error) {
	return s.privateKey, nil
}

func (s *SimpleIdentityStore) GetNodeID() string {
	return s.nodeID
}

func (s *SimpleIdentityStore) GetPublicKey(nodeID string) ([]byte, error) {
	// In production, retrieve the public key for the given nodeID
	// For now, return a dummy public key based on nodeID
	if nodeID == s.nodeID {
		return []byte(hex.EncodeToString(s.privateKey[:16])), nil
	}
	// Generate a deterministic key for other nodes
	key := make([]byte, 32)
	copy(key, []byte(nodeID))
	return []byte(hex.EncodeToString(key[:16])), nil
}

func (s *SimpleIdentityStore) VerifyInitiatorMessage(msg types.InitiatorMessage) error {
	// Simplified verification for bridge use
	return nil
}