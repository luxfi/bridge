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
    },
  },
})
