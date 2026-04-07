// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"math/big"
	"testing"
)

func TestNewCosmosPlugin(t *testing.T) {
	p := NewCosmosPlugin("http://cosmos:26657", "cosmos1abc...")
	if p.Name() != "cosmos" {
		t.Errorf("Name() = %q, want cosmos", p.Name())
	}
	if p.ChainID() != CosmosChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), CosmosChainID)
	}
}

func TestCosmosChainIDValue(t *testing.T) {
	// "COSM" = 0x434F534D
	const want uint64 = 0x434F534D
	if CosmosChainID != want {
		t.Errorf("CosmosChainID = 0x%X, want 0x%X", CosmosChainID, want)
	}
}

func TestCosmosParseDepositFromTxResult(t *testing.T) {
	p := NewCosmosPlugin("http://cosmos:26657", "cosmos1bridge...")

	tests := []struct {
		name     string
		tx       cosmosTxResult
		wantOK   bool
		wantEvt  DepositEvent
	}{
		{
			name: "valid_deposit",
			tx: cosmosTxResult{
				Hash:   "AABBCCDD",
				Height: "1000",
				TxResult: struct {
					Events []cosmosEvent `json:"events"`
				}{
					Events: []cosmosEvent{
						{
							Type: "deposit",
							Attributes: []cosmosAttribute{
								{Key: "nonce", Value: "42"},
								{Key: "recipient", Value: "0x000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"},
								{Key: "amount", Value: "1000000"},
							},
						},
					},
				},
			},
			wantOK: true,
			wantEvt: DepositEvent{
				SrcChainID:  CosmosChainID,
				Nonce:       42,
				Amount:      big.NewInt(1000000),
				TxID:        "AABBCCDD",
				BlockHeight: 1000,
			},
		},
		{
			name: "wrong_event_type",
			tx: cosmosTxResult{
				Hash:   "AABB",
				Height: "500",
				TxResult: struct {
					Events []cosmosEvent `json:"events"`
				}{
					Events: []cosmosEvent{
						{
							Type: "transfer",
							Attributes: []cosmosAttribute{
								{Key: "nonce", Value: "1"},
								{Key: "recipient", Value: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"},
								{Key: "amount", Value: "100"},
							},
						},
					},
				},
			},
			wantOK: false,
		},
		{
			name: "missing_nonce",
			tx: cosmosTxResult{
				Hash:   "CCDD",
				Height: "600",
				TxResult: struct {
					Events []cosmosEvent `json:"events"`
				}{
					Events: []cosmosEvent{
						{
							Type: "deposit",
							Attributes: []cosmosAttribute{
								{Key: "recipient", Value: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"},
								{Key: "amount", Value: "100"},
							},
						},
					},
				},
			},
			wantOK: false,
		},
		{
			name: "missing_recipient",
			tx: cosmosTxResult{
				Hash:   "EEFF",
				Height: "700",
				TxResult: struct {
					Events []cosmosEvent `json:"events"`
				}{
					Events: []cosmosEvent{
						{
							Type: "deposit",
							Attributes: []cosmosAttribute{
								{Key: "nonce", Value: "1"},
								{Key: "amount", Value: "100"},
							},
						},
					},
				},
			},
			wantOK: false,
		},
		{
			name: "missing_amount",
			tx: cosmosTxResult{
				Hash:   "1122",
				Height: "800",
				TxResult: struct {
					Events []cosmosEvent `json:"events"`
				}{
					Events: []cosmosEvent{
						{
							Type: "deposit",
							Attributes: []cosmosAttribute{
								{Key: "nonce", Value: "1"},
								{Key: "recipient", Value: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"},
							},
						},
					},
				},
			},
			wantOK: false,
		},
		{
			name: "no_events",
			tx: cosmosTxResult{
				Hash:   "3344",
				Height: "900",
			},
			wantOK: false,
		},
	}

	for _, tt := range tests {
		ev, ok := p.parseDepositFromTxResult(tt.tx)
		if ok != tt.wantOK {
			t.Errorf("%s: ok = %v, want %v", tt.name, ok, tt.wantOK)
			continue
		}
		if !tt.wantOK {
			continue
		}
		if ev.SrcChainID != tt.wantEvt.SrcChainID {
			t.Errorf("%s: SrcChainID = %d, want %d", tt.name, ev.SrcChainID, tt.wantEvt.SrcChainID)
		}
		if ev.Nonce != tt.wantEvt.Nonce {
			t.Errorf("%s: Nonce = %d, want %d", tt.name, ev.Nonce, tt.wantEvt.Nonce)
		}
		if ev.Amount.Cmp(tt.wantEvt.Amount) != 0 {
			t.Errorf("%s: Amount = %s, want %s", tt.name, ev.Amount, tt.wantEvt.Amount)
		}
		if ev.TxID != tt.wantEvt.TxID {
			t.Errorf("%s: TxID = %q, want %q", tt.name, ev.TxID, tt.wantEvt.TxID)
		}
		if ev.BlockHeight != tt.wantEvt.BlockHeight {
			t.Errorf("%s: BlockHeight = %d, want %d", tt.name, ev.BlockHeight, tt.wantEvt.BlockHeight)
		}
	}
}

func TestCosmosParseDepositRecipientExtraction(t *testing.T) {
	p := NewCosmosPlugin("http://cosmos:26657", "cosmos1bridge...")

	// 20-byte hex recipient with 0x prefix (padded to 32 bytes with leading zeros).
	tx := cosmosTxResult{
		Hash:   "AABB",
		Height: "100",
		TxResult: struct {
			Events []cosmosEvent `json:"events"`
		}{
			Events: []cosmosEvent{
				{
					Type: "deposit",
					Attributes: []cosmosAttribute{
						{Key: "nonce", Value: "1"},
						{Key: "recipient", Value: "0xaabbccddaabbccddaabbccddaabbccddaabbccdd"},
						{Key: "amount", Value: "500"},
					},
				},
			},
		},
	}

	ev, ok := p.parseDepositFromTxResult(tx)
	if !ok {
		t.Fatal("expected deposit to parse")
	}

	want := [20]byte{
		0xaa, 0xbb, 0xcc, 0xdd, 0xaa, 0xbb, 0xcc, 0xdd, 0xaa, 0xbb,
		0xcc, 0xdd, 0xaa, 0xbb, 0xcc, 0xdd, 0xaa, 0xbb, 0xcc, 0xdd,
	}
	if ev.Recipient != want {
		t.Errorf("Recipient = %x, want %x", ev.Recipient, want)
	}
}
