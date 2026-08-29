// The EVM chains the assembler builds transactions for, and their ids.
//
// This is the chain id that goes into the EIP-155 signature. A wrong one is
// not a failed transaction — it is a signature valid on some other chain, so
// the table is data rather than a dozen calls in main, where an id is easy to
// read past and impossible to test.
//
// Every entry is eighteen-decimal because every EVM native coin is. An L2 or
// an L1 that is not gets its own row here rather than a special case at the
// call site.

package main

import (
	"math/big"
	"strings"

	"github.com/luxfi/bridge/internal/txassembler"
)

// evmChainIDs maps a network's internal_name to its EIP-155 chain id.
//
// The Lux-run chains — Lux, Zoo, Hanzo, Pars, Osage — carry the ids their own
// nodes report; each endpoint in internal/txassembler, internal/broadcast and
// internal/depositcheck was asked eth_chainId and answered the id here. The
// rest are the public networks the bridge settles to.
// evmChainIDs is the fallback for a config that declares no chain id, and it
// exists only for that. The networks file is the source: it already carries
// `chainId` and `type: evm` per network, and a second copy here is a second
// thing to keep in step — which it was not. Arbitrum, Optimism and Avalanche
// were offered to users while this map had never heard of them, so a swap to
// any of the three could be accepted and then not assembled.
//
// An EIP-155 id is signed into the transaction. A wrong one produces a
// signature valid on some OTHER chain, so guessing is worse than refusing.
var evmChainIDs = map[string]int64{
	"LUX_MAINNET":   96369,
	"LUX_TESTNET":   96368,
	"ZOO_MAINNET":   200200,
	"ZOO_TESTNET":   200201,
	"HANZO_MAINNET": 36963,
	"PARS_MAINNET":  494949,
	"OSAGE_MAINNET": 1872,

	"ETHEREUM_MAINNET": 1,
	"ETHEREUM_SEPOLIA": 11155111,
	"HOLESKY_TESTNET":  17000,
	"BASE_MAINNET":     8453,
	"BASE_SEPOLIA":     84532,
	"POLYGON_MAINNET":  137,
	"BSC_MAINNET":      56,
	"BSC_TESTNET":      97,
	"ARBITRUM_MAINNET": 42161,
	"OPTIMISM_MAINNET": 10,
	"AVAX_MAINNET":     43114,
}

// configureEVM registers every EVM network the config declares.
//
// Reading the config rather than a list here is what stops the two drifting.
// A network the operator offers is a network a user can select, and one the
// assembler has never heard of fails AFTER they have sent funds — the worst
// place in the flow to discover a gap.
func configureEVM(asm *txassembler.Assembler, networks []Network) {
	seen := map[string]bool{}

	for _, n := range networks {
		if !strings.EqualFold(n.Type, "evm") {
			continue
		}
		id, ok := new(big.Int).SetString(n.ChainID, 10)
		if !ok || id.Sign() <= 0 {
			// No usable id: fall through to the table, and if that has none
			// either the network stays unregistered and a swap to it is
			// refused rather than mis-signed.
			continue
		}
		asm.SetNetwork(n.InternalName, txassembler.PerNetwork{
			ChainID:        id,
			NativeDecimals: 18,
		})
		seen[n.InternalName] = true
	}

	for network, id := range evmChainIDs {
		if seen[network] {
			continue
		}
		asm.SetNetwork(network, txassembler.PerNetwork{
			ChainID:        big.NewInt(id),
			NativeDecimals: 18,
		})
	}
}
