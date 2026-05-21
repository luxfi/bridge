# @luxfi/bridge

The canonical Lux Bridge SDK. Embed bridge.lux.network into any host
application — Lux, Hanzo, Zoo, Liquidity, or any other downstream brand.

## Install

```bash
pnpm add @luxfi/bridge react react-dom
```

## Quick start

```ts
import { mountBridge } from '@luxfi/bridge'

mountBridge({
  config: {
    apiHost: 'https://api.bridge.lux.network',
    env: 'mainnet',
    brand: {
      name: 'Lux Bridge',
      logoUrl: 'https://cdn.lux.network/logo.svg',
      primaryColor: '#0066ff',
    },
  },
})
```

The SDK mounts into `#bridge-root` by default — drop one in your HTML:

```html
<div id="bridge-root"></div>
```

## Full tenant example

Bridge mirrors the `<Exchange>` prop surface from `@luxfi/exchange`, so a
tenant wires identical auth / KMS / wallet / MPC config across both
products:

```ts
import { mountBridge } from '@luxfi/bridge'

mountBridge({
  config: {
    apiHost: 'https://api.bridge.lux.network',
    env:     'mainnet',

    // White-label visual identity.
    brand: {
      name:         'Lux Bridge',
      logoUrl:      'https://cdn.lux.network/logo.svg',
      faviconUrl:   'https://cdn.lux.network/favicon.svg',
      primaryColor: '#0066ff',
    },

    // Auth (Hanzo IAM white-label) — same shape as <Exchange auth={…} />.
    auth: {
      provider: 'iam',
      issuer:   'https://iam.lux.network',
      clientId: 'lux-bridge',
      idHost:   'https://lux.id',
      orgSlug:  'lux',
    },

    // KMS endpoint — same shape as <Exchange kms={…} />.
    kms: { url: 'https://kms.lux.network' },

    // Wallet connector defaults (WalletConnect v2 + EVM chain set).
    wallet: {
      walletConnectProjectId: 'YOUR_WC_PROJECT_ID',
      defaultChainId:         96369,
      supportedChainIds:      [1, 96369, 200200, 36911],
    },

    // MPC cluster — public m-chain handles user wallets; private cluster
    // is optional (treasury / fee accounts only).
    mpc: {
      publicUrl:  'https://mpc.lux.network',
      privateUrl: 'https://mpc-private.lux.network',
      protocol:   'cggmp21',
    },
  },
})
```

Every block above is optional. Tenants that only need brand-level
white-labeling can omit `auth`, `kms`, `wallet`, and `mpc` — the SDK falls
back to its declarative defaults.

## React component

If you prefer to manage your own React tree, import the component:

```tsx
import { Bridge } from '@luxfi/bridge'
import type { BridgeConfig } from '@luxfi/bridge'

const config: BridgeConfig = {
  apiHost: 'https://api.bridge.lux.network',
  env: 'mainnet',
}

export function App() {
  return <Bridge config={config} />
}
```

## API

### `mountBridge(opts)`

| Option | Type | Required | Description |
|---|---|---|---|
| `opts.config` | `BridgeConfig` | yes | Runtime config (api host, env, brand). |
| `opts.rootId` | `string` | no | DOM element id. Defaults to `bridge-root`. |

### `BridgeConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `apiHost` | `string` | yes | Bridge API endpoint. |
| `env` | `string` | yes | `mainnet`, `testnet`, or custom env slug. |
| `brand` | `BrandConfig` | no | White-label overrides. |
| `auth` | `BridgeAuthConfig` | no | Hanzo IAM OIDC block. Mirrors `<Exchange auth={…} />`. |
| `kms` | `BridgeKMSConfig` | no | KMS endpoint block. Mirrors `<Exchange kms={…} />`. |
| `wallet` | `BridgeWalletConfig` | no | Wallet connector defaults (WalletConnect v2 + chain set). |
| `mpc` | `BridgeMPCConfig` | no | MPC cluster URLs + threshold-sig protocol. |
| `clientId` | `string` | no | Deprecated — use `auth.clientId`. |
| `iamOrg` | `string` | no | Deprecated — use `auth.orgSlug`. |

### `BridgeAuthConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | `'iam'` | yes | Identity provider. |
| `issuer` | `string` | yes | OIDC issuer URL. |
| `clientId` | `string` | yes | OIDC client id (per tenant). |
| `idHost` | `string?` | no | White-label IAM hostname. |
| `orgSlug` | `string?` | no | IAM org slug for multi-tenant routing. |

### `BridgeKMSConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | yes | KMS endpoint URL. |

### `BridgeWalletConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `walletConnectProjectId` | `string?` | no | WalletConnect v2 project id. |
| `defaultChainId` | `number?` | no | EVM chain id selected on first connect. |
| `supportedChainIds` | `number[]?` | no | Allow-list of EVM chain ids. |

### `BridgeMPCConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `publicUrl` | `string` | yes | Public MPC cluster URL (m-chain). |
| `privateUrl` | `string?` | no | Private MPC cluster URL (treasury fees). |
| `protocol` | `'cggmp21' \| 'frost'?` | no | Threshold-sig protocol. |

### `BrandConfig`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name. Applied to `document.title`. |
| `logoUrl` | `string?` | Logo URL (SVG preferred). |
| `faviconUrl` | `string?` | Applied to `<link rel="icon">`. |
| `primaryColor` | `string?` | CSS color. Applied as `--brand-primary`. |
| `secondaryColor` | `string?` | CSS color. Applied as `--brand-secondary`. |
| `supportEmail` | `string?` | Footer support email. |
| `docsUrl` | `string?` | Optional docs link. |

## Architecture

`@luxfi/bridge` is the only package consumers import. Internals live under the
private `@luxbridge/*` scope and are not published:

```
@luxfi/bridge          (this package — public SDK)
├── @luxbridge/app     (the bridge React app)
├── @luxbridge/settings (network + asset registry)
└── @luxfi/brand        (Lux brand defaults)
```

One canonical SDK name. One mount function. One config shape.

## License

MIT
