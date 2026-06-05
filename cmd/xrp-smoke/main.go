// XRP destination-release smoke test against the live XRPL network.
//
// Two modes:
//
//   testnet (default) — exercises the full happy path against
//   altnet using the hardcoded release-wallet vitals captured from
//   /tmp/bridge-data-testnet2/release-wallets.json. Single
//   command: `go run ./cmd/xrp-smoke [--broadcast]`.
//
//   mainnet (--mainnet) — same code path against xrplcluster.com.
//   Defaults are intentionally blank; operator MUST supply
//   --release-address, --release-pubkey, --release-wallet-id, and
//   --recipient. Without --broadcast the smoke stops at the signed
//   tx_blob (no XRP moves). With --broadcast real XRP moves on
//   mainnet — every flag is checked twice and the smoke prints the
//   confirmation prompt operators need to read before pressing
//   enter.
//
// Steps in both modes:
//   1. xrp.Provider reads sequence + open_ledger_fee from live network
//   2. txassembler.PreSignXRP builds canonical Payment + signing bytes
//   3. mpcd-single /sign through the mpc-router returns a 64-byte ed25519 sig
//   4. txassembler.FinalizeXRP emits the uppercase-hex tx_blob
//   5. xrp.Provider.SubmitBlob pushes to the network (only with --broadcast)

package main

import (
	"bytes"
	"bufio"
	"context"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/luxfi/bridge/internal/txassembler"
	"github.com/luxfi/bridge/internal/xrp"
)

func main() {
	broadcast := flag.Bool("broadcast", false, "actually submit the signed tx_blob to the chosen XRPL network. On mainnet this MOVES REAL XRP — the smoke prints an extra confirmation prompt before submitting.")
	mainnet := flag.Bool("mainnet", false, "target XRPL mainnet (xrplcluster.com) instead of altnet testnet. Defaults below switch off; release-address / release-pubkey / release-wallet-id / recipient MUST be supplied.")
	releaseAddrFlag := flag.String("release-address", "", "r-address of the release wallet to send from. Required when --mainnet.")
	releasePubHexFlag := flag.String("release-pubkey", "", "hex-encoded ed25519 public key of the release wallet (32 B / 64 hex). Required when --mainnet.")
	releaseWalletFlag := flag.String("release-wallet-id", "", "mpc wallet_id under which mpcd-single (or real mpcd) holds the release key. Required when --mainnet.")
	recipientAddrFlag := flag.String("recipient", "", "r-address the smoke sends to. Required when --mainnet.")
	amountXRP := flag.Float64("amount-xrp", 1.5, "amount in XRP to send.")
	routerURLFlag := flag.String("router-url", "http://localhost:9700", "mpc-router URL for /sign dispatch.")
	flag.Parse()

	// Testnet defaults — vitals captured from
	// /tmp/bridge-data-testnet2/release-wallets.json.
	const (
		testnetReleaseAddr   = "rfYTWP5kAW6EPgfYre4QpfCVNFEtsTjy38"
		testnetReleasePubHex = "3136e6df793018909be3692b7e850db47f58677c2ea7f0e46c49704853f2997d"
		testnetReleaseWallet = "bridge-xrp_testnet-1780651469792"
		testnetRecipientAddr = "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX"
	)

	network := "XRP_TESTNET"
	releaseAddr := testnetReleaseAddr
	releasePubHex := testnetReleasePubHex
	releaseWallet := testnetReleaseWallet
	recipientAddr := testnetRecipientAddr
	if *mainnet {
		network = "XRP_MAINNET"
		releaseAddr = *releaseAddrFlag
		releasePubHex = *releasePubHexFlag
		releaseWallet = *releaseWalletFlag
		recipientAddr = *recipientAddrFlag
		missing := []string{}
		if releaseAddr == "" {
			missing = append(missing, "--release-address")
		}
		if releasePubHex == "" {
			missing = append(missing, "--release-pubkey")
		}
		if releaseWallet == "" {
			missing = append(missing, "--release-wallet-id")
		}
		if recipientAddr == "" {
			missing = append(missing, "--recipient")
		}
		if len(missing) > 0 {
			log.Fatalf("--mainnet requires %v — none of these have testnet-style defaults, since signing for an unknown mainnet wallet would just leak signatures, and broadcasting to a random recipient would move real XRP", missing)
		}
		if *broadcast {
			fmt.Printf("\n*** MAINNET BROADCAST CONFIRMATION ***\n")
			fmt.Printf("    from:   %s\n", releaseAddr)
			fmt.Printf("    to:     %s\n", recipientAddr)
			fmt.Printf("    amount: %.6f XRP\n", *amountXRP)
			fmt.Printf("    wallet_id: %s\n", releaseWallet)
			fmt.Printf("This will move real XRP. Type 'YES' to continue: ")
			scanner := bufio.NewScanner(os.Stdin)
			if !scanner.Scan() || scanner.Text() != "YES" {
				log.Fatalf("aborted (response %q != YES)", scanner.Text())
			}
		}
	}

	ctx := context.Background()
	prov := xrp.NewProvider("https://xrplcluster.com", "https://s.altnet.rippletest.net:51234", 15*time.Second)

	fmt.Printf("network: %s\n", network)
	info, ok, err := prov.AccountInfo(ctx, network, releaseAddr)
	if err != nil {
		log.Fatalf("AccountInfo: %v", err)
	}
	if !ok {
		log.Fatalf("release wallet %s actNotFound — was the faucet drop confirmed?", releaseAddr)
	}
	fmt.Printf("✅ provider.AccountInfo  balance=%s drops  sequence=%d\n",
		info.AccountData.Balance, info.AccountData.Sequence)

	fee, err := prov.ServerInfoFee(ctx, network)
	if err != nil {
		log.Fatalf("ServerInfoFee: %v", err)
	}
	fmt.Printf("✅ provider.ServerInfoFee fee=%d drops\n", fee)

	asm := &txassembler.Assembler{}
	unsigned, err := asm.PreSignXRP(ctx, txassembler.SwapIntent{
		DestinationNetwork: network,
		DestinationAsset:   "XRP",
		DestinationAddress: recipientAddr,
		Amount:             *amountXRP,
		SenderAddress:      releaseAddr,
	}, prov, releasePubHex)
	if err != nil {
		log.Fatalf("PreSignXRP: %v", err)
	}
	fmt.Printf("✅ PreSignXRP            amount=%d drops fee=%d seq=%d signingBytes=%d\n",
		unsigned.AmountDrops, unsigned.FeeDrops, unsigned.Sequence, len(unsigned.SigningBytes))

	sigHex, err := signViaRouter(*routerURLFlag, releaseWallet, hex.EncodeToString(unsigned.SigningBytes))
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

	res, err := prov.SubmitBlob(ctx, network, blob)
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
