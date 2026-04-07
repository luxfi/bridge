// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"time"
)

const AptosChainID uint64 = 0x41505400 // "APT\x00" in Teleporter namespace

// AptosPlugin polls the Aptos REST API for deposit events from the bridge
// Move module. Aptos uses ed25519 signing.
type AptosPlugin struct {
	apiURL     string
	bridgeAddr string // Module address (0x-prefixed)
	client     *http.Client
}

func NewAptosPlugin(apiURL, bridgeAddr string) *AptosPlugin {
	return &AptosPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *AptosPlugin) Name() string    { return "aptos" }
func (a *AptosPlugin) ChainID() uint64 { return AptosChainID }

// PollDeposits fetches deposit events from the bridge module's event handle
// starting from the given ledger version. Aptos events are accessed via the
// REST endpoint for the module's DepositEvent handle.
func (a *AptosPlugin) PollDeposits(ctx context.Context, fromVersion uint64) ([]DepositEvent, uint64, error) {
	// Get current ledger version.
	currentVersion, err := a.getLedgerVersion(ctx)
	if err != nil {
		return nil, fromVersion, fmt.Errorf("aptos: get ledger version: %w", err)
	}
	if currentVersion <= fromVersion {
		return nil, fromVersion, nil
	}

	events, err := a.getDepositEvents(ctx, fromVersion)
	if err != nil {
		return nil, fromVersion, fmt.Errorf("aptos: get deposit events: %w", err)
	}

	var deposits []DepositEvent
	for _, ev := range events {
		version, ok := new(big.Int).SetString(ev.Version, 10)
		if !ok {
			log.Printf("WARN: aptos: skip event with bad version %q", ev.Version)
			continue
		}
		if version.Uint64() <= fromVersion {
			continue
		}

		nonce, ok := new(big.Int).SetString(ev.Data.Nonce, 10)
		if !ok {
			log.Printf("WARN: aptos: skip event with bad nonce %q", ev.Data.Nonce)
			continue
		}

		amount, ok := new(big.Int).SetString(ev.Data.Amount, 10)
		if !ok {
			log.Printf("WARN: aptos: skip event with bad amount %q", ev.Data.Amount)
			continue
		}

		recipient, err := aptosHexToRecipient(ev.Data.Recipient)
		if err != nil {
			log.Printf("WARN: aptos: skip event with bad recipient %q: %v", ev.Data.Recipient, err)
			continue
		}

		deposits = append(deposits, DepositEvent{
			SrcChainID:  AptosChainID,
			Nonce:       nonce.Uint64(),
			Recipient:   recipient,
			Amount:      amount,
			TxID:        ev.Version,
			BlockHeight: version.Uint64(),
		})
	}
	return deposits, currentVersion, nil
}

// QueryBacking reads the total_locked field from the bridge module's BridgeStore resource.
func (a *AptosPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	resourceType := fmt.Sprintf("%s::bridge::BridgeStore", a.bridgeAddr)
	url := fmt.Sprintf("%s/v1/accounts/%s/resource/%s", a.apiURL, a.bridgeAddr, resourceType)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aptos: resource request failed: %s: %s", resp.Status, body)
	}

	var resource struct {
		Data struct {
			TotalLocked string `json:"total_locked"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resource); err != nil {
		return nil, fmt.Errorf("aptos: parse resource: %w", err)
	}

	total, ok := new(big.Int).SetString(resource.Data.TotalLocked, 10)
	if !ok {
		return nil, fmt.Errorf("aptos: parse total_locked: %q", resource.Data.TotalLocked)
	}
	return total, nil
}

// ────────────────────────────────────────────────────────────────────
// Aptos REST API helpers
// ────────────────────────────────────────────────────────────────────

type aptosEvent struct {
	Version string `json:"version"`
	Data    struct {
		Nonce     string `json:"nonce"`
		Recipient string `json:"recipient"` // 0x-prefixed hex
		Amount    string `json:"amount"`
	} `json:"data"`
}

func (a *AptosPlugin) getLedgerVersion(ctx context.Context) (uint64, error) {
	url := fmt.Sprintf("%s/v1", a.apiURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("ledger info: %s: %s", resp.Status, body)
	}

	var info struct {
		LedgerVersion string `json:"ledger_version"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return 0, fmt.Errorf("parse ledger info: %w", err)
	}

	v, ok := new(big.Int).SetString(info.LedgerVersion, 10)
	if !ok {
		return 0, fmt.Errorf("parse ledger version: %q", info.LedgerVersion)
	}
	return v.Uint64(), nil
}

func (a *AptosPlugin) getDepositEvents(ctx context.Context, fromVersion uint64) ([]aptosEvent, error) {
	eventHandle := fmt.Sprintf("%s::bridge::BridgeStore", a.bridgeAddr)
	fieldName := "deposit_events"
	url := fmt.Sprintf("%s/v1/accounts/%s/events/%s/%s?start=%d&limit=100",
		a.apiURL, a.bridgeAddr, eventHandle, fieldName, fromVersion+1)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("events request failed: %s: %s", resp.Status, body)
	}

	var events []aptosEvent
	if err := json.Unmarshal(body, &events); err != nil {
		return nil, fmt.Errorf("parse events: %w", err)
	}
	return events, nil
}

// aptosHexToRecipient converts a 0x-prefixed hex string to a [20]byte EVM address.
// Aptos hex values may be up to 32 bytes; the EVM address is the low 20 bytes.
func aptosHexToRecipient(hex string) ([20]byte, error) {
	var recipient [20]byte
	data, err := hexToBytes(hex)
	if err != nil {
		return recipient, err
	}
	if len(data) == 0 {
		return recipient, fmt.Errorf("empty recipient")
	}
	// Take the last 20 bytes (low 160 bits).
	if len(data) > 20 {
		data = data[len(data)-20:]
	}
	copy(recipient[20-len(data):], data)
	return recipient, nil
}
