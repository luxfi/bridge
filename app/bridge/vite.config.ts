import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Tamagui (@hanzo/gui) is a React-Native-first lib; on the web it expects
// `react-native` to resolve to `react-native-web`. Phase 3 R2 adds this
// alias to make the bridge SDK's Button / Input swap bundle cleanly.
//
// Downstream @luxfi/bridge consumers MUST replicate this alias + dedupe
// + TAMAGUI_TARGET define, or Rolldown will fail to resolve
// `react-native` from Tamagui's runtime. See pkg/bridge/README.md
// ("Consuming this SDK from a Vite app") for the canonical block.
export default defineConfig(({ mode }) => {
  // Load VITE_* env from .env / .env.local / .env.<mode>. Read once so
  // the proxy target is parameterized — `VITE_BRIDGE_API_PROXY_TARGET`
  // points the dev proxy at a local cmd/bridge for testnet bring-up:
  //
  //   VITE_BRIDGE_API_PROXY_TARGET=http://localhost:8080 pnpm dev
  //
  // The default (https://bridge-api.lux.network) preserves the existing
  // behavior — devs hit the production backend by default, just like before.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyTarget = env.VITE_BRIDGE_API_PROXY_TARGET || 'https://bridge-api.lux.network'
  const proxyIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(proxyTarget)

  return {
    plugins: [react()],
    resolve: {
      alias: {
        'react-native': 'react-native-web',
      },
      dedupe: ['react', 'react-dom', 'react-native-web'],
    },
    define: {
      // Tamagui's runtime reads these flags at module init.
      'process.env.TAMAGUI_TARGET': JSON.stringify('web'),
      __DEV__: 'false',
    },
    server: {
      port: 3001,
      host: true,
      // Dev-only proxy. Default target is bridge-api.lux.network (the
      // prod backend, which only allow-lists https://bridge.lux.network
      // — we inject that Origin so its CORS gate passes). Override to a
      // local cmd/bridge via VITE_BRIDGE_API_PROXY_TARGET; when the
      // target is on localhost we drop the Origin header rewrite (the
      // local backend has no CORS allow-list).
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: !proxyIsLocal,
          headers: proxyIsLocal
            ? {}
            : {
                Origin: 'https://bridge.lux.network',
              },
        },
      },
    },
    preview: { port: 3001, host: true },
    build: { outDir: 'dist', sourcemap: true },
  }
})
