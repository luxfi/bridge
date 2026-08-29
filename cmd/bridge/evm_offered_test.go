package main

import (
	"math/big"
	"strings"
	"testing"

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
