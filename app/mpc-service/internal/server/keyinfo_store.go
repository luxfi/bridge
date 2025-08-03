package server

import (
	"encoding/json"
	"fmt"

	"github.com/luxfi/mpc/pkg/keyinfo"
	"github.com/luxfi/mpc/pkg/kvstore"
)

// keyInfoStoreWrapper wraps a KVStore to implement keyinfo.Store
type keyInfoStoreWrapper struct {
	kvStore kvstore.KVStore
}

func (k *keyInfoStoreWrapper) Save(walletID string, info *keyinfo.KeyInfo) error {
	data, err := json.Marshal(info)
	if err != nil {
		return fmt.Errorf("failed to marshal key info: %w", err)
	}
	key := fmt.Sprintf("threshold_keyinfo/%s", walletID)
	return k.kvStore.Put(key, data)
}

func (k *keyInfoStoreWrapper) Get(walletID string) (*keyinfo.KeyInfo, error) {
	key := fmt.Sprintf("threshold_keyinfo/%s", walletID)
	data, err := k.kvStore.Get(key)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("key not found")
	}

	var info keyinfo.KeyInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, fmt.Errorf("failed to unmarshal key info: %w", err)
	}
	return &info, nil
}

func (k *keyInfoStoreWrapper) List() ([]keyinfo.KeyInfo, error) {
	// For simplicity, we'll return an empty list
	// In production, you'd implement proper listing
	return []keyinfo.KeyInfo{}, nil
}

func (k *keyInfoStoreWrapper) Close() error {
	return nil
}