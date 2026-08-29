package main

import (
	"math/big"
	"strings"
	"testing"

	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// Every EVM network the operator offers must be assemblable.
//
// The gap this catches is not cosmetic. A network in the picker but absent
// from the assembler is accepted from the user, takes their funds, and then
// cannot build the release — the failure lands after the money has moved.
// Arbitrum, Optimism and Avalanche were live in exactly that state.
func TestEveryOfferedEVMNetworkCanBeAssembled(t *testing.T) {
	cfg, err := LoadConfig("networks.mainnet.yaml")
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	asm := txassembler.New(nil)
	configureEVM(asm, cfg.Networks)

	var missing []string
	var evm int
	for _, n := range cfg.Networks {
		if !strings.EqualFold(n.Type, "evm") {
			continue
		}
		evm++
		got, ok := asm.Networks[n.InternalName]
		if !ok {
			missing = append(missing, n.InternalName+" (unregistered)")
			continue
		}
		// The id is signed into the transaction. A wrong one yields a
		// signature valid on some other chain, which is worse than none.
		want, _ := new(big.Int).SetString(n.ChainID, 10)
		if want != nil && got.ChainID.Cmp(want) != 0 {
			missing = append(missing, n.InternalName+" (id "+got.ChainID.String()+", config says "+n.ChainID+")")
		}
	}

	if evm == 0 {
		t.Fatal("no EVM networks in the config, so this test proves nothing")
	}
	if len(missing) > 0 {
		t.Fatalf("offered but not assemblable: %s", strings.Join(missing, ", "))
	}
	t.Logf("%d EVM networks offered, all assemblable", evm)
}

// A non-EVM network must NOT be registered as one. Bitcoin has no EIP-155 id,
// and giving it one would be inventing a fact about a chain.
func TestNonEVMNetworksAreNotRegisteredAsEVM(t *testing.T) {
	cfg, err := LoadConfig("networks.mainnet.yaml")
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	asm := txassembler.New(nil)
	configureEVM(asm, cfg.Networks)

	for _, n := range cfg.Networks {
		if strings.EqualFold(n.Type, "evm") {
			continue
		}
		if _, ok := asm.Networks[n.InternalName]; ok {
			t.Errorf("%s is %q, not evm, and was registered on the EVM assembler", n.InternalName, n.Type)
		}
	}
}

// Every network offered must have at least its native asset. A network in
// four of the five tables a crossing needs is one whose gap is found after
// the user has sent funds.
func TestEveryOfferedNetworkHasItsNativeAsset(t *testing.T) {
	cfg, err := LoadConfig("networks.mainnet.yaml")
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	assets := map[string]map[string]bool{}
	for _, tk := range cfg.Tokens {
		if assets[tk.Network] == nil {
			assets[tk.Network] = map[string]bool{}
		}
		assets[tk.Network][strings.ToUpper(tk.Asset)] = true
	}

	for _, n := range cfg.Networks {
		if !assets[n.InternalName][strings.ToUpper(n.NativeCurrency)] {
			t.Errorf("%s is offered with no %s row — it cannot price or move its own gas",
				n.InternalName, n.NativeCurrency)
		}
	}
}

// Every network offered must be complete across every table a crossing
// touches, not just the one whoever added it happened to edit.
//
// A network reaches a user through several independently-edited tables. Present
// in all but one, it is selectable, takes the deposit, and fails at the missing
// step — after the funds have moved. That is exactly what happened when the
// nine networks below were added: the network rows and the asset rows were
// filled and the deposit-RPC table was not, so a Celo deposit would have been
// watched for on a chain the watcher could not reach.
func TestEveryOfferedNetworkIsCompleteAcrossTheTables(t *testing.T) {
	cfg, err := LoadConfig("networks.mainnet.yaml")
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	assets := map[string]bool{}
	for _, tk := range cfg.Tokens {
		assets[tk.Network] = true
	}

	for _, n := range cfg.Networks {
		// The address family. Without it custody mints on the wrong chain,
		// and until today an unnamed network silently became EVM.
		if _, known := mchain.AddressTypeFor(n.InternalName); !known {
			t.Errorf("%s: no address family — custody cannot mint a correct deposit address", n.InternalName)
		}

		// The deposit RPC. Without it a deposit is never seen and the swap
		// waits forever on money that has already arrived.
		if depositcheck.RPCURLFor(n.InternalName) == "" {
			t.Errorf("%s: no deposit RPC — a deposit to it would never be observed", n.InternalName)
		}

		// At least one asset, or there is nothing to move.
		if !assets[n.InternalName] {
			t.Errorf("%s: no asset rows", n.InternalName)
		}
	}
}
