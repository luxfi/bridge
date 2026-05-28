package main

import (
	"flag"

	"github.com/luxfi/bridge/pkg/tenant"
)

// applyTenantOverrides patches flag pointers with values from the
// tenant config, but only when the operator did NOT explicitly pass
// the flag on the command line. Flag wins; tenant fills gaps. This
// preserves the legacy CLI ergonomics (operators can still pass any
// flag) while letting white-label shims declare everything via YAML.
//
// The pointer-soup signature is unfortunate but the rest of main.go
// reads these as dereferenced *string / *int values; passing them
// here lets us mutate the same memory without restructuring.
func applyTenantOverrides(
	t *tenant.Config,
	cfgPath *string,
	addr *string,
	mpcURL *string,
	mpcOrgID *string,
	profile *string,
	releasePoolMintNetwork *string,
	releasePoolSize *int,
) {
	if t == nil {
		return
	}

	set := map[string]bool{}
	flag.Visit(func(f *flag.Flag) {
		set[f.Name] = true
	})

	// --config (networks.yaml path).
	if !set["config"] && t.NetworksConfigPath != "" {
		*cfgPath = t.NetworksConfigPath
	}

	// --addr (listen).
	if !set["addr"] && t.Listen != "" {
		*addr = t.Listen
	}

	// --mpc-url. Tenant ships the cluster URL; operator can still
	// override for local-dev pointed at a different daemon.
	if !set["mpc-url"] && t.MPC.URL != "" {
		*mpcURL = t.MPC.URL
	}

	// --mpc-org-id. Tenant pins the multiplex tag.
	if !set["mpc-org-id"] && t.MPC.OrgID != "" {
		*mpcOrgID = t.MPC.OrgID
	}

	// --profile. PQProfile from tenant maps directly to the
	// selectProfile() values via the alias table in main.go's
	// selectProfile() — "strict-pq" and "classical-compat" are both
	// accepted there.
	if !set["profile"] && t.PQProfile != "" {
		*profile = t.PQProfile
	}

	// --release-pool-size + --release-pool-mint-network: EVM pool.
	if !set["release-pool-size"] {
		*releasePoolSize = t.ReleasePool.EVM.Size
	}
	if !set["release-pool-mint-network"] && t.ReleasePool.EVM.MintNetwork != "" {
		*releasePoolMintNetwork = t.ReleasePool.EVM.MintNetwork
	}
}
