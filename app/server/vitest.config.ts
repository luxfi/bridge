import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Server-side unit tests. Mirrors the `@/*` path alias used by the
// runtime (see tsconfig.json) so tests import the same way as src code.
const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(here, "src"),
      // @luxfi/utila ships from a published rollup-built dist/ to npm,
      // but the workspace dist/ is not built in-place (the rollup
      // config has a long-standing outDir-vs-file-path issue). For
      // tests, point at the TypeScript source directly — vitest can
      // handle TS imports natively. Production builds resolve through
      // the package.json main field once the published artifact is
      // installed from npm.
      "@luxfi/utila": path.resolve(here, "../../pkg/utila/src/grpc-client.ts"),
    },
  },
})
