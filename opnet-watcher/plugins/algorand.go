// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"time"
)

const AlgorandChainID uint64 = 0x414C474F // "ALGO" in Teleporter namespace

// AlgorandPlugin polls the Algod API for deposit transactions from the
// bridge application. Algorand uses ed25519 signing.
type AlgorandPlugin struct {
	apiURL string
	appID  string // Application ID
	apiKey string
	client *http.Client
}

func NewAlgorandPlugin(apiURL, appID, apiKey string) *AlgorandPlugin {
	return &AlgorandPlugin{
		apiURL: apiURL,
		appID:  appID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *AlgorandPlugin) Name() string    { return "algorand" }
func (a *AlgorandPlugin) ChainID() uint64 { return AlgorandChainID }

// PollDeposits fetches application call transactions to the bridge app from the Algod
// indexer starting at fromRound+1, then parses deposit parameters from application args.
func (a *AlgorandPlugin) PollDeposits(ctx context.Context, fromRound uint64) ([]DepositEvent, uint64, error) {
	currentRound, err := a.getLastRound(ctx)
	if err != nil {
		return nil, fromRound, fmt.Errorf("algorand: get last round: %w", err)
	}
	if currentRound <= fromRound {
		return nil, fromRound, nil
	}

	txs, err := a.getAppTransactions(ctx, fromRound+1)
	if err != nil {
		return nil, fromRound, fmt.Errorf("algorand: get app transactions: %w", err)
	}

	var events []DepositEvent
	for _, tx := range txs {
		if tx.AppCall == nil {
			continue
		}
		deposit, ok := parseAlgorandDeposit(&tx)
		if !ok {
			continue
		}
		events = append(events, deposit)
	}

	return events, currentRound, nil
}

// QueryBacking reads the total_locked key from the bridge application's global state.
func (a *AlgorandPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	var appInfo struct {
		Params struct {
			GlobalState []algoStateKV `json:"global-state"`
		} `json:"params"`
	}
	if err := a.apiGet(ctx, fmt.Sprintf("/v2/applications/%s", a.appID), &appInfo); err != nil {
		return nil, fmt.Errorf("algorand: query backing: %w", err)
	}

	for _, kv := range appInfo.Params.GlobalState {
		keyBytes, err := base64.StdEncoding.DecodeString(kv.Key)
		if err != nil {
			continue
		}
		if string(keyBytes) != "total_locked" {
			continue
		}
		// Type 2 = uint, type 1 = bytes.
		if kv.Value.Type == 2 {
			return new(big.Int).SetUint64(kv.Value.Uint), nil
		}
		if kv.Value.Type == 1 {
			valBytes, err := base64.StdEncoding.DecodeString(kv.Value.Bytes)
			if err != nil {
				return nil, fmt.Errorf("algorand: decode total_locked bytes: %w", err)
			}
			return new(big.Int).SetBytes(valBytes), nil
		}
	}
	return big.NewInt(0), nil
}

// ────────────────────────────────────────────────────────────────────
// Algod API types and helpers
// ────────────────────────────────────────────────────────────────────

type algoStateKV struct {
	Key   string `json:"key"` // base64
	Value struct {
		Type  uint64 `json:"type"`  // 1=bytes, 2=uint
		Bytes string `json:"bytes"` // base64 (when type=1)
		Uint  uint64 `json:"uint"`  // (when type=2)
	} `json:"value"`
}

type algoTransaction struct {
	ID              string        `json:"id"`
	ConfirmedRound  uint64        `json:"confirmed-round"`
	AppCall         *algoAppCall  `json:"application-transaction"`
}

type algoAppCall struct {
	AppID           uint64   `json:"application-id"`
	AppArgs         []string `json:"application-args"` // base64-encoded
	OnCompletion    string   `json:"on-completion"`
}

// parseAlgorandDeposit extracts a DepositEvent from an Algorand application call transaction.
// The bridge app expects application args:
//   [0] method selector ("deposit")
//   [1] nonce (8 bytes big-endian)
//   [2] recipient (20 bytes EVM address)
//   [3] amount (8 bytes big-endian)
func parseAlgorandDeposit(tx *algoTransaction) (DepositEvent, bool) {
	if tx.AppCall == nil || len(tx.AppCall.AppArgs) < 4 {
		return DepositEvent{}, false
	}

	methodArg, err := base64.StdEncoding.DecodeString(tx.AppCall.AppArgs[0])
	if err != nil || string(methodArg) != "deposit" {
		return DepositEvent{}, false
	}

	nonceBytes, err := base64.StdEncoding.DecodeString(tx.AppCall.AppArgs[1])
	if err != nil || len(nonceBytes) < 8 {
		log.Printf("WARN: algorand: skip tx %s: invalid nonce arg", tx.ID)
		return DepositEvent{}, false
	}
	nonce := be64(nonceBytes[:8])

	recipBytes, err := base64.StdEncoding.DecodeString(tx.AppCall.AppArgs[2])
	if err != nil || len(recipBytes) < 20 {
		log.Printf("WARN: algorand: skip tx %s: invalid recipient arg", tx.ID)
		return DepositEvent{}, false
	}
	var recipient [20]byte
	copy(recipient[:], recipBytes[:20])

	amountBytes, err := base64.StdEncoding.DecodeString(tx.AppCall.AppArgs[3])
	if err != nil || len(amountBytes) < 8 {
		log.Printf("WARN: algorand: skip tx %s: invalid amount arg", tx.ID)
		return DepositEvent{}, false
	}
	amount := new(big.Int).SetBytes(amountBytes[:8])

	return DepositEvent{
		SrcChainID:  AlgorandChainID,
		Nonce:       nonce,
		Recipient:   recipient,
		Amount:      amount,
		TxID:        tx.ID,
		BlockHeight: tx.ConfirmedRound,
	}, true
}

func (a *AlgorandPlugin) getLastRound(ctx context.Context) (uint64, error) {
	var status struct {
		LastRound uint64 `json:"last-round"`
	}
	if err := a.apiGet(ctx, "/v2/status", &status); err != nil {
		return 0, err
	}
	return status.LastRound, nil
}

func (a *AlgorandPlugin) getAppTransactions(ctx context.Context, minRound uint64) ([]algoTransaction, error) {
	path := fmt.Sprintf("/v2/transactions?application-id=%s&min-round=%d&type=appl", a.appID, minRound)
	var resp struct {
		Transactions []algoTransaction `json:"transactions"`
	}
	if err := a.apiGet(ctx, path, &resp); err != nil {
		return nil, err
	}
	return resp.Transactions, nil
}

func (a *AlgorandPlugin) apiGet(ctx context.Context, path string, dest interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.apiURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Algo-API-Token", a.apiKey)

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("algod %s: %d: %s", path, resp.StatusCode, body)
	}
	return json.Unmarshal(body, dest)
}
