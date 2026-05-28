package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBalanceProbe_TON_HappyPath(t *testing.T) {
	var gotAddress, gotAPIKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAddress = r.URL.Query().Get("address")
		gotAPIKey = r.Header.Get("X-API-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"result":"123456789"}`))
	}))
	defer srv.Close()

	c := NewBalanceProbe(nil, time.Second)
	c.TONBalanceURLs = map[string]string{"TON_TESTNET": srv.URL}
	c.TONAPIKeys = map[string]string{"TON_TESTNET": "api-secret"}

	balance, err := c.BalanceAt(context.Background(), "TON_TESTNET", "0:abc")
	if err != nil {
		t.Fatal(err)
	}
	if balance.Uint64() != 123456789 {
		t.Errorf("balance = %s, want 123456789", balance.String())
	}
	if gotAddress != "0:abc" {
		t.Errorf("address query = %q, want %q", gotAddress, "0:abc")
	}
	if gotAPIKey != "api-secret" {
		t.Errorf("X-API-Key = %q, want %q", gotAPIKey, "api-secret")
	}
}

func TestBalanceProbe_TON_UnconfiguredReturnsFamilyNotSupported(t *testing.T) {
	c := NewBalanceProbe(nil, time.Second)
	// No TONBalanceURLs configured.
	_, err := c.BalanceAt(context.Background(), "TON_TESTNET", "0:abc")
	if !errors.Is(err, ErrFamilyNotSupportedForBalance) {
		t.Errorf("expected ErrFamilyNotSupportedForBalance, got %v", err)
	}
}

func TestBalanceProbe_TON_GatewayError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":false,"error":"address not found"}`))
	}))
	defer srv.Close()

	c := NewBalanceProbe(nil, time.Second)
	c.TONBalanceURLs = map[string]string{"TON_TESTNET": srv.URL}

	_, err := c.BalanceAt(context.Background(), "TON_TESTNET", "0:nonexistent")
	if err == nil {
		t.Fatal("expected error from ok:false response")
	}
}

func TestBalanceProbe_TON_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream down", http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c := NewBalanceProbe(nil, time.Second)
	c.TONBalanceURLs = map[string]string{"TON_TESTNET": srv.URL}

	_, err := c.BalanceAt(context.Background(), "TON_TESTNET", "0:abc")
	if err == nil {
		t.Fatal("expected HTTP 503 error")
	}
}

func TestBalanceProbe_EVMUnaffectedByTONFields(t *testing.T) {
	// Make sure adding TON config doesn't break the EVM path. Use a
	// stubbed eth_getBalance endpoint.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0xabc"}`))
	}))
	defer srv.Close()

	c := NewBalanceProbe(map[string]string{"ETHEREUM_SEPOLIA": srv.URL}, time.Second)
	c.TONBalanceURLs = map[string]string{"TON_TESTNET": "http://nowhere"}
	c.TONAPIKeys = map[string]string{"TON_TESTNET": "ignored-on-evm"}

	balance, err := c.BalanceAt(context.Background(), "ETHEREUM_SEPOLIA", "0xabc")
	if err != nil {
		t.Fatal(err)
	}
	if balance.String() != "2748" { // 0xabc decimal
		t.Errorf("balance = %s, want 2748", balance.String())
	}
}
