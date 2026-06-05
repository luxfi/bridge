// XRP destination-release smoke test against the live XRPL altnet.
//
// Verifies the full happy path end-to-end:
//   1. xrp.Provider reads sequence + open_ledger_fee from live altnet
//   2. txassembler.PreSignXRP builds canonical Payment + signing bytes
//   3. mpcd-single /sign through the mpc-router returns a 64-byte ed25519 sig
//   4. txassembler.FinalizeXRP emits the uppercase-hex tx_blob
//   5. xrp.Provider.SubmitBlob pushes to the altnet (only with --broadcast)
//
// Run with: go run ./cmd/xrp-smoke [--broadcast]

package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/luxfi/bridge/internal/txassembler"
	"github.com/luxfi/bridge/internal/xrp"
)

func main() {
	broadcast := flag.Bool("broadcast", false, "actually submit the signed tx_blob to XRPL altnet")
	flag.Parse()

	// Release-wallet vitals captured from
	// /tmp/bridge-data-testnet2/release-wallets.json.
	const (
		releaseAddr   = "rfYTWP5kAW6EPgfYre4QpfCVNFEtsTjy38"
		releasePubHex = "3136e6df793018909be3692b7e850db47f58677c2ea7f0e46c49704853f2997d"
		releaseWallet = "bridge-xrp_testnet-1780651469792"
		recipientAddr = "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX"
		routerURL     = "http://localhost:9700"
	)

	ctx := context.Background()
	prov := xrp.NewProvider("https://xrplcluster.com", "https://s.altnet.rippletest.net:51234", 15*time.Second)

	info, ok, err := prov.AccountInfo(ctx, "XRP_TESTNET", releaseAddr)
	if err != nil {
		log.Fatalf("AccountInfo: %v", err)
	}
	if !ok {
		log.Fatalf("release wallet %s actNotFound — was the faucet drop confirmed?", releaseAddr)
	}
	fmt.Printf("✅ provider.AccountInfo  balance=%s drops  sequence=%d\n",
		info.AccountData.Balance, info.AccountData.Sequence)

	fee, err := prov.ServerInfoFee(ctx, "XRP_TESTNET")
	if err != nil {
		log.Fatalf("ServerInfoFee: %v", err)
	}
	fmt.Printf("✅ provider.ServerInfoFee fee=%d drops\n", fee)

	asm := &txassembler.Assembler{}
	unsigned, err := asm.PreSignXRP(ctx, txassembler.SwapIntent{
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: recipientAddr,
		Amount:             1.5,
		SenderAddress:      releaseAddr,
	}, prov, releasePubHex)
	if err != nil {
		log.Fatalf("PreSignXRP: %v", err)
	}
	fmt.Printf("✅ PreSignXRP            amount=%d drops fee=%d seq=%d signingBytes=%d\n",
		unsigned.AmountDrops, unsigned.FeeDrops, unsigned.Sequence, len(unsigned.SigningBytes))

	sigHex, err := signViaRouter(routerURL, releaseWallet, hex.EncodeToString(unsigned.SigningBytes))
	if err != nil {
		log.Fatalf("router sign: %v", err)
	}
	sig, err := hex.DecodeString(sigHex)
	if err != nil {
		log.Fatalf("decode sig: %v", err)
	}
	if len(sig) != 64 {
		log.Fatalf("ed25519 sig len=%d, want 64", len(sig))
	}
	fmt.Printf("✅ mpc-router sign        sig=%s…\n", sigHex[:16])

	blob, err := asm.FinalizeXRP(unsigned, sig)
	if err != nil {
		log.Fatalf("FinalizeXRP: %v", err)
	}
	fmt.Printf("✅ FinalizeXRP            tx_blob=%s… (%d hex chars)\n", blob[:32], len(blob))

	if !*broadcast {
		fmt.Printf("\nℹ️  --broadcast not set; stopping at signed blob.\n")
		return
	}

	res, err := prov.SubmitBlob(ctx, "XRP_TESTNET", blob)
	if err != nil {
		log.Fatalf("SubmitBlob: %v", err)
	}
	fmt.Printf("✅ submit                 engine_result=%s hash=%s\n",
		res.EngineResult, res.TxJSON.Hash)
}

// signViaRouter POSTs to the mpc-router's /sign endpoint, which
// dispatches XRP requests to the single-signer mpcd. Returns the
// ed25519 signature hex.
func signViaRouter(routerURL, walletID, msgHex string) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"org_id":    "bridge",
		"wallet_id": walletID,
		"message":   msgHex,
	})
	req, err := http.NewRequest("POST", routerURL+"/sign", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer dummy")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Signature  string `json:"signature"`
		ResultType string `json:"result_type"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.ResultType != "success" {
		return "", fmt.Errorf("result_type=%s", out.ResultType)
	}
	return out.Signature, nil
}
