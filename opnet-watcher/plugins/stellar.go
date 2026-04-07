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

const StellarChainID uint64 = 0x584C4D00 // "XLM\x00" in Teleporter namespace

// StellarPlugin polls the Stellar Horizon REST API for deposit operations
// to the bridge account. Stellar uses ed25519 signing.
type StellarPlugin struct {
	horizonURL string
	bridgeAddr string // Stellar public key (G...)
	client     *http.Client
}

func NewStellarPlugin(horizonURL, bridgeAddr string) *StellarPlugin {
	return &StellarPlugin{
		horizonURL: horizonURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *StellarPlugin) Name() string    { return "stellar" }
func (s *StellarPlugin) ChainID() uint64 { return StellarChainID }

// PollDeposits fetches payment operations to the bridge account via the
// Horizon REST API, starting from the given cursor (ledger sequence).
// Extracts recipient EVM address from the transaction memo.
func (s *StellarPlugin) PollDeposits(ctx context.Context, fromLedger uint64) ([]DepositEvent, uint64, error) {
	currentLedger, err := s.getCurrentLedger(ctx)
	if err != nil {
		return nil, fromLedger, fmt.Errorf("stellar: get ledger: %w", err)
	}
	if currentLedger <= fromLedger {
		return nil, fromLedger, nil
	}

	ops, err := s.getOperations(ctx, fromLedger)
	if err != nil {
		return nil, fromLedger, fmt.Errorf("stellar: get operations: %w", err)
	}

	var events []DepositEvent
	for _, op := range ops {
		deposit, ok := s.parseDepositFromOp(ctx, op)
		if ok {
			events = append(events, deposit)
		}
	}

	return events, currentLedger, nil
}

// QueryBacking returns the total balance held by the bridge account
// by querying the Horizon account endpoint and summing relevant balances.
func (s *StellarPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	url := fmt.Sprintf("%s/accounts/%s", s.horizonURL, s.bridgeAddr)

	body, err := s.httpGet(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("stellar: get account: %w", err)
	}

	var acct struct {
		Balances []stellarBalance `json:"balances"`
	}
	if err := json.Unmarshal(body, &acct); err != nil {
		return nil, fmt.Errorf("stellar: parse account: %w", err)
	}

	total := new(big.Int)
	for _, bal := range acct.Balances {
		amount := parseStroops(bal.Balance)
		if amount != nil {
			total.Add(total, amount)
		}
	}
	return total, nil
}

// ────────────────────────────────────────────────────────────────────
// Stellar Horizon REST types and helpers
// ────────────────────────────────────────────────────────────────────

type stellarOperation struct {
	ID              string `json:"id"`
	Type            string `json:"type"`
	TransactionHash string `json:"transaction_hash"`
	SourceAccount   string `json:"source_account"`
	To              string `json:"to"`
	From            string `json:"from"`
	Amount          string `json:"amount"`
	AssetType       string `json:"asset_type"`
	AssetCode       string `json:"asset_code"`
	LedgerAttr      uint64 `json:"ledger_attr"`
	CreatedAt       string `json:"created_at"`
	// Links for fetching parent transaction (contains memo).
	Links struct {
		Transaction struct {
			Href string `json:"href"`
		} `json:"transaction"`
	} `json:"_links"`
}

type stellarBalance struct {
	Balance   string `json:"balance"`
	AssetType string `json:"asset_type"`
	AssetCode string `json:"asset_code"`
}

type stellarTransaction struct {
	Hash        string `json:"hash"`
	Ledger      uint64 `json:"ledger"`
	Memo        string `json:"memo"`
	MemoType    string `json:"memo_type"`
}

func (s *StellarPlugin) getCurrentLedger(ctx context.Context) (uint64, error) {
	body, err := s.httpGet(ctx, s.horizonURL)
	if err != nil {
		return 0, err
	}

	var root struct {
		CoreLatestLedger uint64 `json:"core_latest_ledger"`
	}
	if err := json.Unmarshal(body, &root); err != nil {
		return 0, fmt.Errorf("parse root: %w", err)
	}
	return root.CoreLatestLedger, nil
}

func (s *StellarPlugin) getOperations(ctx context.Context, fromLedger uint64) ([]stellarOperation, error) {
	url := fmt.Sprintf("%s/accounts/%s/operations?cursor=%d&order=asc&limit=100",
		s.horizonURL, s.bridgeAddr, fromLedger)

	var allOps []stellarOperation

	for url != "" {
		body, err := s.httpGet(ctx, url)
		if err != nil {
			return allOps, fmt.Errorf("get operations: %w", err)
		}

		var page struct {
			Embedded struct {
				Records []stellarOperation `json:"records"`
			} `json:"_embedded"`
			Links struct {
				Next struct {
					Href string `json:"href"`
				} `json:"next"`
			} `json:"_links"`
		}
		if err := json.Unmarshal(body, &page); err != nil {
			return allOps, fmt.Errorf("parse operations: %w", err)
		}

		if len(page.Embedded.Records) == 0 {
			break
		}

		allOps = append(allOps, page.Embedded.Records...)

		// Stop paginating after first batch to avoid unbounded fetches.
		// The watcher will pick up more on the next tick.
		url = ""
	}

	return allOps, nil
}

func (s *StellarPlugin) parseDepositFromOp(ctx context.Context, op stellarOperation) (DepositEvent, bool) {
	// Only payment and path_payment operations TO the bridge account.
	switch op.Type {
	case "payment", "path_payment_strict_receive", "path_payment_strict_send":
	default:
		return DepositEvent{}, false
	}

	// Must be incoming payment to the bridge address.
	if op.To != s.bridgeAddr {
		return DepositEvent{}, false
	}

	amount := parseStroops(op.Amount)
	if amount == nil || amount.Sign() <= 0 {
		return DepositEvent{}, false
	}

	// Fetch the parent transaction to get the memo (contains recipient EVM address).
	txURL := op.Links.Transaction.Href
	if txURL == "" {
		txURL = fmt.Sprintf("%s/transactions/%s", s.horizonURL, op.TransactionHash)
	}

	txBody, err := s.httpGet(ctx, txURL)
	if err != nil {
		log.Printf("WARN: stellar: skip op %s: fetch tx failed: %v", op.ID, err)
		return DepositEvent{}, false
	}

	var tx stellarTransaction
	if err := json.Unmarshal(txBody, &tx); err != nil {
		log.Printf("WARN: stellar: skip op %s: parse tx failed: %v", op.ID, err)
		return DepositEvent{}, false
	}

	// The memo contains the recipient EVM address.
	// MemoType "text": hex-encoded EVM address (0x-prefixed or raw).
	// MemoType "hash": 32 bytes, EVM address in last 20 bytes.
	var recipient [20]byte
	switch tx.MemoType {
	case "text":
		recipientBytes, err := hexToBytes(tx.Memo)
		if err != nil || len(recipientBytes) < 20 {
			log.Printf("WARN: stellar: skip op %s: invalid text memo %q", op.ID, tx.Memo)
			return DepositEvent{}, false
		}
		copy(recipient[:], recipientBytes[len(recipientBytes)-20:])
	case "hash":
		// Hash memo is 32 bytes hex-encoded by Horizon.
		memoBytes, err := hexToBytes(tx.Memo)
		if err != nil || len(memoBytes) < 20 {
			log.Printf("WARN: stellar: skip op %s: invalid hash memo", op.ID)
			return DepositEvent{}, false
		}
		copy(recipient[:], memoBytes[len(memoBytes)-20:])
	default:
		log.Printf("WARN: stellar: skip op %s: unsupported memo type %q", op.ID, tx.MemoType)
		return DepositEvent{}, false
	}

	return DepositEvent{
		SrcChainID:  StellarChainID,
		Nonce:       tx.Ledger,
		Recipient:   recipient,
		Amount:      amount,
		TxID:        tx.Hash,
		BlockHeight: tx.Ledger,
	}, true
}

// parseStroops converts a Stellar amount string (e.g., "100.0000000") to stroops (big.Int).
// 1 XLM = 10,000,000 stroops. Stellar amounts always have 7 decimal places.
func parseStroops(s string) *big.Int {
	if s == "" {
		return nil
	}

	// Split on decimal point.
	var intPart, fracPart string
	dot := -1
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			dot = i
			break
		}
	}
	if dot >= 0 {
		intPart = s[:dot]
		fracPart = s[dot+1:]
	} else {
		intPart = s
	}

	// Pad or truncate fraction to 7 digits.
	for len(fracPart) < 7 {
		fracPart += "0"
	}
	fracPart = fracPart[:7]

	combined := intPart + fracPart
	val, ok := new(big.Int).SetString(combined, 10)
	if !ok {
		return nil
	}
	return val
}

func (s *StellarPlugin) httpGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}
