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
| `clientId` | `string` | no | Lux ID OIDC client id. |
| `iamOrg` | `string` | no | Lux ID OIDC org slug. |

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
