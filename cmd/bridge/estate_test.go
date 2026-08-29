// The estate's own L1s, and the tables that have to agree about them.
//
// A network reaches a user through five independent tables: the address
// family that derives its custody address, the endpoint the deposit watcher
// reads, the endpoint the broadcaster writes, the endpoint the assembler
// builds against, and the asset row that gives the native coin its decimals.
// Each is edited separately, so a chain added to four of them is a chain the
// picker offers and the swap then fails on — and it fails late, after the
// user has already sent funds to a deposit address.
//
// This asserts the five agree, for the chains Lux itself runs. It reads the
// tables rather than restating them: a sixth table added later is not covered
// here, but nothing here goes stale when an endpoint changes.

package main

import (
	"math/big"
	"net/http"
	"testing"

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/tokens"
	"github.com/luxfi/bridge/internal/txassembler"
)

// The EVM L1s Lux runs. Chain ids and native symbols are the ones the estate
// registry reports at api-explore.lux.network/v1/explorer/admin/chains, and
// each endpoint was asked eth_chainId and answered the id written beside it.
//
// These are the chains the bridge must reach for it to be a superset of what
// the exchange lists, which is the whole point of holding them in one place.
var estate = []struct {
	network  string
	chainID  int64
	asset    string
	endpoint string
}{
	{"LUX_MAINNET", 96369, "LUX", "https://api.lux.network/v1/bc/C/rpc"},
	{"ZOO_MAINNET", 200200, "ZOO", "https://api.zoo.network/v1/bc/C/rpc"},
	{"HANZO_MAINNET", 36963, "AI", "https://api.hanzo.network/v1/bc/C/rpc"},
	{"PARS_MAINNET", 494949, "PARS", "https://api.pars.network/v1/bc/C/rpc"},
	{"OSAGE_MAINNET", 1872, "OSG", "https://api.osage.network/v1/bc/C/rpc"},
}

// Custody on an EVM chain is the same secp256k1 key at the same address, so
// every one of these derives an eth address. A chain missing from the table
// falls through to a default; asserting it explicitly is what keeps a later
// non-EVM addition from inheriting that default silently.
func TestEstateDerivesEthAddresses(t *testing.T) {
	for _, c := range estate {
		if got := mchain.AddressTypeFor(c.network); got != mchain.AddressTypeETH {
			t.Errorf("%s derives %v, want eth — custody address would be malformed", c.network, got)
		}
	}
}

// The deposit watcher reads one table, the broadcaster writes against another
// and the assembler builds against a third. They are separate because a
// destination may need a different provider than a source, but for a chain
// Lux runs there is one node and all three name it.
func TestEstateEndpointsAgree(t *testing.T) {
	assembler := txassembler.DefaultEndpoints()
	for _, c := range estate {
		for _, table := range []struct {
			name string
			got  string
		}{
			{"depositcheck", depositcheck.RPCURLFor(c.network)},
			{"broadcast", broadcast.RPCURLFor(c.network)},
			{"txassembler", assembler[c.network]},
		} {
			if table.got == "" {
				t.Errorf("%s missing from %s — a swap on it cannot be %s", c.network, table.name, map[string]string{
					"depositcheck": "seen",
					"broadcast":    "sent",
					"txassembler":  "built",
				}[table.name])
				continue
			}
			if table.got != c.endpoint {
				t.Errorf("%s in %s reads %s, want %s", c.network, table.name, table.got, c.endpoint)
			}
		}
	}
}

// Without an asset row the native coin has no decimals, and an amount is
// scaled by whatever the caller assumed.
func TestEstateNativeAssetsRegistered(t *testing.T) {
	reg := tokens.DefaultRegistry()
	for _, c := range estate {
		tok, ok := reg.Lookup(c.network, c.asset)
		if !ok {
			t.Errorf("%s has no %s row — the native coin has no decimals", c.network, c.asset)
			continue
		}
		if tok.Decimals != 18 {
			t.Errorf("%s %s has %d decimals, want 18", c.network, c.asset, tok.Decimals)
		}
		if tok.Contract != "" {
			t.Errorf("%s %s carries contract %s — the native coin is not an ERC-20", c.network, c.asset, tok.Contract)
		}
	}
}

// The shipped config is what the deployment mounts, so a chain wired through
// the tables above but absent from it reaches nobody. This reads the file the
// container gets and asks the handler the SPA asks, which is the only pairing
// that shows a chain the whole way from declaration to wire.
func TestEstateReachesTheWire(t *testing.T) {
	cfg, err := LoadConfig("networks.mainnet.yaml")
	if err != nil {
		t.Fatalf("shipped mainnet config does not load: %v", err)
	}
	app := newRigForConfig(t, cfg)
	status, body := fireRequest(t, app, http.MethodGet, "/api/networks", nil)
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}

	served := map[string]map[string]any{}
	for _, row := range decodeNetworks(t, body) {
		name, _ := row["internal_name"].(string)
		served[name] = row
	}

	for _, c := range estate {
		row, ok := served[c.network]
		if !ok {
			t.Errorf("%s is wired but the shipped config never offers it", c.network)
			continue
		}
		if got, _ := row["chain_id"].(string); got != itoa(c.chainID) {
			t.Errorf("%s served as chain %q, want %q", c.network, got, itoa(c.chainID))
		}
		if got, _ := row["native_currency"].(string); got != c.asset {
			t.Errorf("%s served with native %q, want %q", c.network, got, c.asset)
		}
	}
}

func itoa(n int64) string { return big.NewInt(n).String() }

// The assembler signs with the chain id in the domain, so a wrong one here is
// a signature the destination rejects — or, worse, one another chain accepts.
func TestEstateChainIDsAreConfigured(t *testing.T) {
	asm := txassembler.New(nil)
	configureEVM(asm)
	for _, c := range estate {
		net, ok := asm.Networks[c.network]
		if !ok {
			t.Errorf("%s not configured on the assembler", c.network)
			continue
		}
		if net.ChainID.Cmp(big.NewInt(c.chainID)) != 0 {
			t.Errorf("%s configured as chain %s, want %d", c.network, net.ChainID, c.chainID)
		}
	}
}
