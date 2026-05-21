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
  server: { port: 3001, host: true },
  preview: { port: 3001, host: true },
  build: { outDir: 'dist', sourcemap: true },
})
