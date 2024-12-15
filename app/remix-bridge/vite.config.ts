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
      },
      presets: [vercelPreset()],
    }),
    tsconfigPaths(),
    viteCommonjs(),
  ],
  optimizeDeps: {
    include: ['react-dom'],
  },
})
