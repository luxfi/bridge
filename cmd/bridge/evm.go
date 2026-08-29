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

	"github.com/luxfi/bridge/internal/txassembler"
)

// evmChainIDs maps a network's internal_name to its EIP-155 chain id.
//
// The Lux-run chains — Lux, Zoo, Hanzo, Pars, Osage — carry the ids their own
// nodes report; each endpoint in internal/txassembler, internal/broadcast and
// internal/depositcheck was asked eth_chainId and answered the id here. The
// rest are the public networks the bridge settles to.
var evmChainIDs = map[string]int64{
	// Lux and the chains it runs. Sovereign L1s, each its own primary
	// network, so an id here is the whole identity of the chain.
	"LUX_MAINNET":   96369,
	"LUX_TESTNET":   96368,
	"ZOO_MAINNET":   200200,
	"ZOO_TESTNET":   200201,
	"HANZO_MAINNET": 36963,
	"PARS_MAINNET":  494949,
	"OSAGE_MAINNET": 1872,

	// Public networks.
	"ETHEREUM_MAINNET": 1,
	"ETHEREUM_SEPOLIA": 11155111,
	"HOLESKY_TESTNET":  17000,
	"BASE_MAINNET":     8453,
	"BASE_SEPOLIA":     84532,
	"POLYGON_MAINNET":  137,
	"BSC_MAINNET":      56,
	"BSC_TESTNET":      97,
}

// configureEVM registers every EVM network on the assembler.
func configureEVM(asm *txassembler.Assembler) {
	for network, id := range evmChainIDs {
		asm.SetNetwork(network, txassembler.PerNetwork{
			ChainID:        big.NewInt(id),
			NativeDecimals: 18,
		})
	}
}
