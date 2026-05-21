# Lux Bridge — brand-pinned image

Companion to the Zoo Bridge shim (`zoo/bridge/app/`). Both shims layer a
brand-specific `brand.json` on top of the same upstream bridge3 image:

| Domain                  | Image                          | Brand              |
|-------------------------|--------------------------------|--------------------|
| bridge.lux.network      | ghcr.io/luxfi/bridge:latest    | Lux (this folder)  |
| bridge.zoo.network      | ghcr.io/zooai/bridge:latest    | Zoo (zoo/bridge/app) |

The bridge3 app loads `/brand.json` via `brand.ts::loadBrand()` at runtime.
The base image already defaults to Lux branding, so this shim is mostly
symmetry / explicitness — pin the brand inside the deployable artefact
rather than relying on the upstream default.

## Adding a new white-label brand

Copy this folder to `<target>/bridge/app/`, swap `brand.json`, change the
image label in `Dockerfile`, run `pnpm validate && pnpm build:image`.
