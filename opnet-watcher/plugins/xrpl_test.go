// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"encoding/json"
	"math/big"
	"testing"
)

func TestNewXRPLPlugin(t *testing.T) {
	p := NewXRPLPlugin("http://xrpl:51234", "rBridgeAddr...")
	if p.Name() != "xrpl" {
		t.Errorf("Name() = %q, want xrpl", p.Name())
	}
	if p.ChainID() != XRPLChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), XRPLChainID)
	}
}

func TestXRPLChainIDValue(t *testing.T) {
	// "XRPL" = 0x5852504C
	const want uint64 = 0x5852504C
	if XRPLChainID != want {
		t.Errorf("XRPLChainID = 0x%X, want 0x%X", XRPLChainID, want)
	}
}

func TestXRPLParseDepositFromTx(t *testing.T) {
	bridgeAddr := "rBridgeAccount123"
	p := NewXRPLPlugin("http://xrpl:51234", bridgeAddr)

	tag := bridgeDepositTag
	recipientHex := "aabbccddaabbccddaabbccddaabbccddaabbccdd" // 20 bytes

	tests := []struct {
		name   string
		entry  xrplTxEntry
		wantOK bool
	}{
		{
			name: "valid_xrp_payment",
			entry: xrplTxEntry{
				Tx: struct {
					TransactionType string     `json:"TransactionType"`
					Hash            string     `json:"hash"`
					Destination     string     `json:"Destination"`
					DestinationTag  *uint64    `json:"DestinationTag"`
					Amount          xrplAmount `json:"Amount"`
					Memos           []xrplMemo `json:"Memos"`
				}{
					TransactionType: "Payment",
					Hash:            "TXHASH123",
					Destination:     bridgeAddr,
					DestinationTag:  &tag,
					Amount:          mustXRPLAmount("1000000"),
					Memos: []xrplMemo{
						{Memo: struct {
							MemoData string `json:"MemoData"`
							MemoType string `json:"MemoType"`
						}{MemoData: recipientHex}},
					},
				},
				Meta: struct {
					TransactionResult string `json:"TransactionResult"`
				}{TransactionResult: "tesSUCCESS"},
				Validated:   true,
				LedgerIndex: 500,
			},
			wantOK: true,
		},
		{
			name: "not_payment",
			entry: xrplTxEntry{
				Tx: struct {
					TransactionType string     `json:"TransactionType"`
					Hash            string     `json:"hash"`
					Destination     string     `json:"Destination"`
					DestinationTag  *uint64    `json:"DestinationTag"`
					Amount          xrplAmount `json:"Amount"`
					Memos           []xrplMemo `json:"Memos"`
				}{
					TransactionType: "OfferCreate",
					Destination:     bridgeAddr,
					DestinationTag:  &tag,
				},
				Meta: struct {
					TransactionResult string `json:"TransactionResult"`
				}{TransactionResult: "tesSUCCESS"},
				Validated: true,
			},
			wantOK: false,
		},
		{
			name: "failed_transaction",
			entry: xrplTxEntry{
				Tx: struct {
					TransactionType string     `json:"TransactionType"`
					Hash            string     `json:"hash"`
					Destination     string     `json:"Destination"`
					DestinationTag  *uint64    `json:"DestinationTag"`
					Amount          xrplAmount `json:"Amount"`
					Memos           []xrplMemo `json:"Memos"`
				}{
					TransactionType: "Payment",
					Destination:     bridgeAddr,
					DestinationTag:  &tag,
					Amount:          mustXRPLAmount("1000000"),
				},
				Meta: struct {
					TransactionResult string `json:"TransactionResult"`
				}{TransactionResult: "tecINSUFFICIENT_RESERVE"},
				Validated: true,
			},
			wantOK: false,
		},
		{
			name: "wrong_destination",
			entry: xrplTxEntry{
				Tx: struct {
					TransactionType string     `json:"TransactionType"`
					Hash            string     `json:"hash"`
					Destination     string     `json:"Destination"`
					DestinationTag  *uint64    `json:"DestinationTag"`
					Amount          xrplAmount `json:"Amount"`
					Memos           []xrplMemo `json:"Memos"`
				}{
					TransactionType: "Payment",
					Destination:     "rOtherAccount",
					DestinationTag:  &tag,
					Amount:          mustXRPLAmount("1000000"),
				},
				Meta: struct {
					TransactionResult string `json:"TransactionResult"`
				}{TransactionResult: "tesSUCCESS"},
				Validated: true,
			},
			wantOK: false,
		},
		{
			name: "no_destination_tag",
			entry: xrplTxEntry{
				Tx: struct {
					TransactionType string     `json:"TransactionType"`
					Hash            string     `json:"hash"`
					Destination     string     `json:"Destination"`
					DestinationTag  *uint64    `json:"DestinationTag"`
					Amount          xrplAmount `json:"Amount"`
					Memos           []xrplMemo `json:"Memos"`
				}{
					TransactionType: "Payment",
					Destination:     bridgeAddr,
					DestinationTag:  nil,
					Amount:          mustXRPLAmount("1000000"),
				},
				Meta: struct {
					TransactionResult string `json:"TransactionResult"`
				}{TransactionResult: "tesSUCCESS"},
				Validated: true,
			},
			wantOK: false,
		},
		{
			name: "no_memo",
			entry: xrplTxEntry{
				Tx: struct {
					TransactionType string     `json:"TransactionType"`
					Hash            string     `json:"hash"`
					Destination     string     `json:"Destination"`
					DestinationTag  *uint64    `json:"DestinationTag"`
					Amount          xrplAmount `json:"Amount"`
					Memos           []xrplMemo `json:"Memos"`
				}{
					TransactionType: "Payment",
					Destination:     bridgeAddr,
					DestinationTag:  &tag,
					Amount:          mustXRPLAmount("1000000"),
					Memos:           nil,
				},
				Meta: struct {
					TransactionResult string `json:"TransactionResult"`
				}{TransactionResult: "tesSUCCESS"},
				Validated: true,
			},
			wantOK: false,
		},
		{
			name: "not_validated",
			entry: xrplTxEntry{
				Tx: struct {
					TransactionType string     `json:"TransactionType"`
					Hash            string     `json:"hash"`
					Destination     string     `json:"Destination"`
					DestinationTag  *uint64    `json:"DestinationTag"`
					Amount          xrplAmount `json:"Amount"`
					Memos           []xrplMemo `json:"Memos"`
				}{
					TransactionType: "Payment",
					Destination:     bridgeAddr,
					DestinationTag:  &tag,
					Amount:          mustXRPLAmount("1000000"),
					Memos: []xrplMemo{
						{Memo: struct {
							MemoData string `json:"MemoData"`
							MemoType string `json:"MemoType"`
						}{MemoData: recipientHex}},
					},
				},
				Meta: struct {
					TransactionResult string `json:"TransactionResult"`
				}{TransactionResult: "tesSUCCESS"},
				Validated: false,
			},
			wantOK: false,
		},
	}

	for _, tt := range tests {
		ev, ok := p.parseDepositFromTx(tt.entry)
		if ok != tt.wantOK {
			t.Errorf("%s: ok = %v, want %v", tt.name, ok, tt.wantOK)
			continue
		}
		if !tt.wantOK {
			continue
		}
		if ev.SrcChainID != XRPLChainID {
			t.Errorf("%s: SrcChainID = %d, want %d", tt.name, ev.SrcChainID, XRPLChainID)
		}
		if ev.Amount.Cmp(big.NewInt(1000000)) != 0 {
			t.Errorf("%s: Amount = %s, want 1000000", tt.name, ev.Amount)
		}
		if ev.BlockHeight != 500 {
			t.Errorf("%s: BlockHeight = %d, want 500", tt.name, ev.BlockHeight)
		}

		wantRecip := [20]byte{
			0xaa, 0xbb, 0xcc, 0xdd, 0xaa, 0xbb, 0xcc, 0xdd, 0xaa, 0xbb,
			0xcc, 0xdd, 0xaa, 0xbb, 0xcc, 0xdd, 0xaa, 0xbb, 0xcc, 0xdd,
		}
		if ev.Recipient != wantRecip {
			t.Errorf("%s: Recipient = %x, want %x", tt.name, ev.Recipient, wantRecip)
		}
	}
}

func TestXRPLAmountDropsValue(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		wantNil bool
		want    int64
	}{
		{"string_drops", `"1000000"`, false, 1000000},
		{"zero", `"0"`, false, 0},
		{"large", `"999999999999"`, false, 999999999999},
		{"issued_currency", `{"value":"100","currency":"USD","issuer":"rXXX"}`, true, 0},
	}

	for _, tt := range tests {
		var a xrplAmount
		if err := json.Unmarshal([]byte(tt.raw), &a); err != nil {
			t.Fatalf("%s: unmarshal: %v", tt.name, err)
		}
		val := a.dropsValue()
		if tt.wantNil {
			if val != nil {
				t.Errorf("%s: expected nil, got %s", tt.name, val)
			}
		} else {
			if val == nil {
				t.Fatalf("%s: expected non-nil", tt.name)
			}
			if val.Int64() != tt.want {
				t.Errorf("%s: drops = %d, want %d", tt.name, val.Int64(), tt.want)
			}
		}
	}
}

func TestBridgeDepositTagValue(t *testing.T) {
	// "LUXB" = 0x4C555842
	const want uint64 = 0x4C555842
	if bridgeDepositTag != want {
		t.Errorf("bridgeDepositTag = 0x%X, want 0x%X", bridgeDepositTag, want)
	}
}

// mustXRPLAmount creates an xrplAmount from a drops string (e.g., "1000000").
func mustXRPLAmount(drops string) xrplAmount {
	raw, _ := json.Marshal(drops)
	return xrplAmount(raw)
}
