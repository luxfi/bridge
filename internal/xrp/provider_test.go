package xrp

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// Construction + routing.
// =============================================================================

func TestNewProvider_Defaults(t *testing.T) {
	p := NewProvider("", "", 0)
	if p.MainnetURL != DefaultMainnetURL {
		t.Errorf("MainnetURL = %q, want default %q", p.MainnetURL, DefaultMainnetURL)
	}
	if p.TestnetURL != DefaultTestnetURL {
		t.Errorf("TestnetURL = %q, want default %q", p.TestnetURL, DefaultTestnetURL)
	}
	if p.Timeout != DefaultTimeout {
		t.Errorf("Timeout = %v, want default %v", p.Timeout, DefaultTimeout)
	}
}

func TestUrlFor_RoutesTestnetCaseInsensitive(t *testing.T) {
	p := &Provider{MainnetURL: "https://main.example", TestnetURL: "https://test.example"}
	cases := map[string]string{
		"XRP_TESTNET": "https://test.example",
		"xrp_testnet": "https://test.example",
		"XRP_MAINNET": "https://main.example",
		"":            "https://main.example",
		"LUX_TESTNET": "https://main.example", // only the literal XRP_TESTNET name routes to testnet
	}
	for net, want := range cases {
		if got := p.urlFor(net); got != want {
			t.Errorf("urlFor(%q) = %q, want %q", net, got, want)
		}
	}
}

func TestSetHTTPClient_ReplacesTransport(t *testing.T) {
	var hitCustom bool
	custom := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		hitCustom = true
		return httpJSONResponse(200, map[string]any{"result": map[string]any{"status": "success"}}), nil
	})}

	p := NewProvider("http://unused", "http://unused", time.Second)
	p.SetHTTPClient(custom)
	p.SetHTTPClient(nil) // nil must be a no-op, not clear the client

	if _, err := p.ServerInfoFee(context.Background(), "XRP_MAINNET"); err != nil {
		t.Fatalf("ServerInfoFee: %v", err)
	}
	if !hitCustom {
		t.Error("SetHTTPClient(custom) then SetHTTPClient(nil) should still use the custom client")
	}
}

// roundTripFunc adapts a function to http.RoundTripper for injecting a
// fake transport without a real listening server.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func httpJSONResponse(status int, body any) *http.Response {
	b, _ := json.Marshal(body)
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(bytes.NewReader(b)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

// =============================================================================
// AccountInfo / BalanceDrops
// =============================================================================

func TestAccountInfo_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Account": "rTest", "Balance": "1500000", "Sequence": 5},
				"status":       "success",
				"validated":    true,
			},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	info, ok, err := p.AccountInfo(context.Background(), "XRP_MAINNET", "rTest")
	if err != nil {
		t.Fatalf("AccountInfo: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true for a funded account")
	}
	if info.AccountData.Balance != "1500000" || info.AccountData.Sequence != 5 {
		t.Errorf("account data = %+v, want Balance=1500000 Sequence=5", info.AccountData)
	}
}

func TestAccountInfo_ActNotFoundIsOkFalseNotError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{"status": "error", "error": "actNotFound"},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	_, ok, err := p.AccountInfo(context.Background(), "XRP_MAINNET", "rNeverFunded")
	if err != nil {
		t.Fatalf("AccountInfo: unexpected error %v", err)
	}
	if ok {
		t.Error("expected ok=false for actNotFound")
	}
}

func TestAccountInfo_OtherErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{"status": "error", "error": "invalidParams", "error_message": "account malformed"},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	_, _, err := p.AccountInfo(context.Background(), "XRP_MAINNET", "bogus")
	if err == nil || !strings.Contains(err.Error(), "account malformed") {
		t.Errorf("err = %v, want it to surface the XRPL error message", err)
	}
}

func TestBalanceDrops_UnfundedAccountReturnsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{"status": "error", "error": "actNotFound"},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	drops, err := p.BalanceDrops(context.Background(), "XRP_MAINNET", "rNeverFunded")
	if err != nil {
		t.Fatalf("BalanceDrops: %v", err)
	}
	if drops != 0 {
		t.Errorf("drops = %d, want 0", drops)
	}
}

func TestBalanceDrops_ParsesBalanceString(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "42000000"},
				"status":       "success",
			},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	drops, err := p.BalanceDrops(context.Background(), "XRP_MAINNET", "rFunded")
	if err != nil {
		t.Fatalf("BalanceDrops: %v", err)
	}
	if drops != 42_000_000 {
		t.Errorf("drops = %d, want 42000000", drops)
	}
}

func TestBalanceDrops_UnparseableBalanceErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "not-a-number"},
				"status":       "success",
			},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	if _, err := p.BalanceDrops(context.Background(), "XRP_MAINNET", "rFunded"); err == nil {
		t.Fatal("expected an error for an unparseable balance, got nil")
	}
}

// =============================================================================
// SubmitBlob
// =============================================================================

func TestSubmitBlob_Success(t *testing.T) {
	var gotBlob string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Params []map[string]any `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		gotBlob, _ = req.Params[0]["tx_blob"].(string)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"engine_result":         "tesSUCCESS",
				"engine_result_message": "The transaction was applied.",
				"tx_json":               map[string]any{"hash": "ABCDEF"},
				"status":                "success",
			},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	res, err := p.SubmitBlob(context.Background(), "XRP_MAINNET", "DEADBEEF")
	if err != nil {
		t.Fatalf("SubmitBlob: %v", err)
	}
	if res.EngineResult != "tesSUCCESS" || res.TxJSON.Hash != "ABCDEF" {
		t.Errorf("result = %+v, want tesSUCCESS/ABCDEF", res)
	}
	if gotBlob != "DEADBEEF" {
		t.Errorf("request tx_blob = %q, want DEADBEEF", gotBlob)
	}
}

func TestSubmitBlob_TransportErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{"status": "error", "error": "invalidTransaction", "error_message": "malformed blob"},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	_, err := p.SubmitBlob(context.Background(), "XRP_MAINNET", "garbage")
	if err == nil || !strings.Contains(err.Error(), "malformed blob") {
		t.Errorf("err = %v, want it to surface the XRPL rejection reason", err)
	}
}

// =============================================================================
// ServerInfoFee — note the deliberate "never propagate an error" contract:
// every failure mode falls back to the 12-drop default so a flaky
// server_info call can't block the signing driver's fee estimate.
// =============================================================================

func TestServerInfoFee_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"info": map[string]any{
					"validated_ledger": map[string]any{"base_fee_xrp": "0.000010"},
					"load_factor":      256.0,
					"load_base":        256.0,
				},
				"status": "success",
			},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	fee, err := p.ServerInfoFee(context.Background(), "XRP_MAINNET")
	if err != nil {
		t.Fatalf("ServerInfoFee: %v", err)
	}
	if fee != 10 {
		t.Errorf("fee = %d, want 10 drops at load_factor==load_base", fee)
	}
}

func TestServerInfoFee_ScalesUpUnderLoad(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"info": map[string]any{
					"validated_ledger": map[string]any{"base_fee_xrp": "0.000010"},
					"load_factor":      1024.0, // 4x load_base
					"load_base":        256.0,
				},
				"status": "success",
			},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	fee, err := p.ServerInfoFee(context.Background(), "XRP_MAINNET")
	if err != nil {
		t.Fatalf("ServerInfoFee: %v", err)
	}
	if fee != 40 {
		t.Errorf("fee = %d, want 40 drops (10 * 4x load)", fee)
	}
}

func TestServerInfoFee_TransportErrorFallsBackTo12(t *testing.T) {
	p := &Provider{MainnetURL: "http://127.0.0.1:1", TestnetURL: "http://127.0.0.1:1", http: &http.Client{Timeout: time.Second}}
	fee, err := p.ServerInfoFee(context.Background(), "XRP_MAINNET")
	if err != nil {
		t.Fatalf("ServerInfoFee must never return an error, got %v", err)
	}
	if fee != 12 {
		t.Errorf("fee = %d, want fallback 12", fee)
	}
}

func TestServerInfoFee_UnparseableBaseFeeFallsBackTo12(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"info":   map[string]any{"validated_ledger": map[string]any{"base_fee_xrp": "not-a-number"}},
				"status": "success",
			},
		})
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	fee, err := p.ServerInfoFee(context.Background(), "XRP_MAINNET")
	if err != nil {
		t.Fatalf("ServerInfoFee: %v", err)
	}
	if fee != 12 {
		t.Errorf("fee = %d, want fallback 12", fee)
	}
}

// =============================================================================
// do() — shared transport error handling.
// =============================================================================

func TestDo_NonOKStatusSurfacesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream unavailable"))
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	_, _, err := p.AccountInfo(context.Background(), "XRP_MAINNET", "rTest")
	if err == nil || !strings.Contains(err.Error(), "upstream unavailable") {
		t.Errorf("err = %v, want it to surface the HTTP 502 body", err)
	}
}

func TestDo_EmptyResultErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	p := &Provider{MainnetURL: srv.URL, TestnetURL: srv.URL, http: srv.Client()}
	_, _, err := p.AccountInfo(context.Background(), "XRP_MAINNET", "rTest")
	if err == nil {
		t.Fatal("expected an error for an empty result envelope, got nil")
	}
}

// =============================================================================
// truncate — pure function.
// =============================================================================

func TestTruncate(t *testing.T) {
	if got := truncate("short", 200); got != "short" {
		t.Errorf("short input should pass through, got %q", got)
	}
	got := truncate(strings.Repeat("x", 300), 10)
	if got != strings.Repeat("x", 10)+"…" {
		t.Errorf("truncate should cap at n chars + ellipsis, got %q", got)
	}
}
