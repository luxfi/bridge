import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tamagui (@hanzo/gui) is a React-Native-first lib; on the web it expects
// `react-native` to resolve to `react-native-web`. Phase 3 R2 adds this
// alias to make the bridge SDK's Button / Input swap bundle cleanly.
//
// Downstream @luxfi/bridge consumers MUST replicate this alias + dedupe
// + TAMAGUI_TARGET define, or Rolldown will fail to resolve
// `react-native` from Tamagui's runtime. See pkg/bridge/README.md
// ("Consuming this SDK from a Vite app") for the canonical block.
export default defineConfig({
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
    // Dev-only proxy that fronts the production bridge REST API. Browsers
    // would otherwise be blocked: bridge-api.lux.network returns
    // `Access-Control-Allow-Origin: https://bridge.lux.network` and a 500
    // for any other origin. With this proxy in place the browser sees a
    // same-origin request (`/api/*` → localhost) and Vite forwards it to
    // bridge-api.lux.network with `Origin: https://bridge.lux.network`
    // injected. Production builds talk directly to the API (the prod
    // origin is whitelisted server-side) so this block has no effect on
    // the deployed image.
    proxy: {
      '/api': {
        target: 'https://bridge-api.lux.network',
        changeOrigin: true,
        secure: true,
        headers: {
          // Tell bridge-api.lux.network this request came from the prod
          // origin so its CORS allow-list passes. changeOrigin already
          // rewrites the Host header; this overrides the Origin header
          // that node-http-proxy would otherwise forward verbatim.
          Origin: 'https://bridge.lux.network',
        },
      },
    },
  },
  preview: { port: 3001, host: true },
  build: { outDir: 'dist', sourcemap: true },
})
