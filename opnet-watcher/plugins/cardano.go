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
	"strconv"
	"time"
)

const CardanoChainID uint64 = 0x41444100 // "ADA\x00" in Teleporter namespace

// CardanoPlugin polls the Blockfrost API for deposit transactions
// from the bridge script address. Cardano uses ed25519 signing.
type CardanoPlugin struct {
	apiURL     string
	bridgeAddr string // Bech32 script address
	apiKey     string
	client     *http.Client
}

func NewCardanoPlugin(apiURL, bridgeAddr, apiKey string) *CardanoPlugin {
	return &CardanoPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		apiKey:     apiKey,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *CardanoPlugin) Name() string    { return "cardano" }
func (c *CardanoPlugin) ChainID() uint64 { return CardanoChainID }

// PollDeposits fetches deposit transactions to the bridge address from the Blockfrost API
// starting after fromBlock, then inspects UTXOs and metadata for each transaction.
func (c *CardanoPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := c.getBlockHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("cardano: get block height: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	txs, err := c.getAddressTransactions(ctx, fromBlock)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("cardano: get address transactions: %w", err)
	}

	var events []DepositEvent
	for _, tx := range txs {
		utxos, err := c.getTxUTXOs(ctx, tx.TxHash)
		if err != nil {
			log.Printf("WARN: cardano: skip tx %s: utxo fetch: %v", tx.TxHash, err)
			continue
		}

		// Sum lovelace outputs sent to the bridge address.
		amount := new(big.Int)
		for _, out := range utxos.Outputs {
			if out.Address != c.bridgeAddr {
				continue
			}
			for _, a := range out.Amount {
				if a.Unit == "lovelace" {
					val, ok := new(big.Int).SetString(a.Quantity, 10)
					if ok {
						amount.Add(amount, val)
					}
				}
			}
		}
		if amount.Sign() == 0 {
			continue
		}

		// Extract recipient EVM address and nonce from tx metadata.
		meta, err := c.getTxMetadata(ctx, tx.TxHash)
		if err != nil {
			log.Printf("WARN: cardano: skip tx %s: metadata fetch: %v", tx.TxHash, err)
			continue
		}

		recipient, nonce, ok := parseCardanoMetadata(meta)
		if !ok {
			log.Printf("WARN: cardano: skip tx %s: no bridge metadata", tx.TxHash)
			continue
		}

		events = append(events, DepositEvent{
			SrcChainID:  CardanoChainID,
			Nonce:       nonce,
			Recipient:   recipient,
			Amount:      amount,
			TxID:        tx.TxHash,
			BlockHeight: tx.BlockHeight,
		})
	}

	return events, height, nil
}

// QueryBacking returns the total lovelace balance at the bridge address.
func (c *CardanoPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	var addrInfo struct {
		Amount []blockfrostAmount `json:"amount"`
	}
	if err := c.apiGet(ctx, fmt.Sprintf("/addresses/%s", c.bridgeAddr), &addrInfo); err != nil {
		return nil, fmt.Errorf("cardano: query backing: %w", err)
	}

	for _, a := range addrInfo.Amount {
		if a.Unit == "lovelace" {
			val, ok := new(big.Int).SetString(a.Quantity, 10)
			if !ok {
				return nil, fmt.Errorf("cardano: parse lovelace balance: %s", a.Quantity)
			}
			return val, nil
		}
	}
	return big.NewInt(0), nil
}

// ────────────────────────────────────────────────────────────────────
// Blockfrost API types and helpers
// ────────────────────────────────────────────────────────────────────

type blockfrostAmount struct {
	Unit     string `json:"unit"`
	Quantity string `json:"quantity"`
}

type blockfrostAddrTx struct {
	TxHash      string `json:"tx_hash"`
	BlockHeight uint64 `json:"block_height"`
}

type blockfrostUTXOs struct {
	Outputs []struct {
		Address string             `json:"address"`
		Amount  []blockfrostAmount `json:"amount"`
	} `json:"outputs"`
}

type blockfrostMetadataEntry struct {
	Label   string          `json:"label"`
	JSONVal json.RawMessage `json:"json_metadata"`
}

func (c *CardanoPlugin) getBlockHeight(ctx context.Context) (uint64, error) {
	var block struct {
		Height uint64 `json:"height"`
	}
	if err := c.apiGet(ctx, "/blocks/latest", &block); err != nil {
		return 0, err
	}
	return block.Height, nil
}

func (c *CardanoPlugin) getAddressTransactions(ctx context.Context, fromBlock uint64) ([]blockfrostAddrTx, error) {
	path := fmt.Sprintf("/addresses/%s/transactions?from=%d&order=asc", c.bridgeAddr, fromBlock+1)
	var txs []blockfrostAddrTx
	if err := c.apiGet(ctx, path, &txs); err != nil {
		return nil, err
	}
	return txs, nil
}

func (c *CardanoPlugin) getTxUTXOs(ctx context.Context, txHash string) (*blockfrostUTXOs, error) {
	var utxos blockfrostUTXOs
	if err := c.apiGet(ctx, fmt.Sprintf("/txs/%s/utxos", txHash), &utxos); err != nil {
		return nil, err
	}
	return &utxos, nil
}

func (c *CardanoPlugin) getTxMetadata(ctx context.Context, txHash string) ([]blockfrostMetadataEntry, error) {
	var meta []blockfrostMetadataEntry
	if err := c.apiGet(ctx, fmt.Sprintf("/txs/%s/metadata", txHash), &meta); err != nil {
		return nil, err
	}
	return meta, nil
}

// parseCardanoMetadata extracts the EVM recipient address and nonce from Cardano
// transaction metadata. The bridge uses label "674" (CIP-20 message) with a JSON
// object containing "recipient" (hex EVM address) and "nonce" (uint64 string).
func parseCardanoMetadata(entries []blockfrostMetadataEntry) ([20]byte, uint64, bool) {
	for _, entry := range entries {
		if entry.Label != "674" {
			continue
		}
		var meta struct {
			Recipient string `json:"recipient"`
			Nonce     string `json:"nonce"`
		}
		if err := json.Unmarshal(entry.JSONVal, &meta); err != nil {
			continue
		}
		if len(meta.Recipient) == 0 || len(meta.Nonce) == 0 {
			continue
		}

		addrBytes, err := hexToBytes(meta.Recipient)
		if err != nil || len(addrBytes) != 20 {
			continue
		}
		var recipient [20]byte
		copy(recipient[:], addrBytes)

		nonce, err := strconv.ParseUint(meta.Nonce, 10, 64)
		if err != nil {
			continue
		}
		return recipient, nonce, true
	}
	return [20]byte{}, 0, false
}

func (c *CardanoPlugin) apiGet(ctx context.Context, path string, dest interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("project_id", c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("blockfrost %s: %d: %s", path, resp.StatusCode, body)
	}
	return json.Unmarshal(body, dest)
}
