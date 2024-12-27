import { vitePlugin as remix } from '@remix-run/dev'
import { vercelPreset } from '@vercel/remix/vite'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

export default defineConfig({
  define: {
    'process.env': {}
  },
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
      },
      presets: [vercelPreset()],
    }),
    tsconfigPaths(),
    viteCommonjs(),
  ],
  optimizeDeps: {
    include: ['react-dom'],
      // Not excluding these seem to:
      //   a) always force a refresh after initial load  (cf(?): https://github.com/vitejs/vite/discussions/14801)
      //   b) optimize an old version!
    exclude: [
      '@hanzo/ui/primitives-common', 
      '@hanzo/ui/util', 
    ]
  },
})
