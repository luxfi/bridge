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
        v3_singleFetch: true, // cf: https://github.com/remix-run/react-router/pull/12441
        v3_lazyRouteDiscovery: false // silences warning
      },
      presets: [vercelPreset()],
    }),
    tsconfigPaths(),
    viteCommonjs(),
  ],
  optimizeDeps: {
    include: [
      'react-dom',
      // mobx-react-lite does `import { useSyncExternalStore } from
      // 'use-sync-external-store/shim'` — a NAMED import from a package whose
      // shim is CommonJS (`module.exports = require('../cjs/…')`). Vite can only
      // discover named exports of a CJS module by pre-bundling it; left
      // externalised it serves the raw file and the named import throws
      // "does not provide an export named 'useSyncExternalStore'".
      //
      // That throw happens at module scope, so it takes out `observer()` and
      // therefore EVERY observed component: the swap form's asset pickers stay
      // loading skeletons forever and the app never even requests /api/settings.
      // A dead UI with no error on screen.
      //
      // It started when use-sync-external-store 1.6.0 added an `exports` map —
      // the shim's code is byte-identical to 1.4.0, only its resolution changed,
      // and the optimizer stopped picking it up. mobx-react-lite is named here
      // rather than the version being pinned, because the CJS-ness is permanent
      // and the next resolution bump would reopen it.
      //
      // It has to be mobx-react-lite and not the shim itself: under pnpm the
      // shim exists only inside mobx-react-lite's own node_modules, so Vite
      // cannot resolve it from this app and refuses the entry outright
      // ("Failed to resolve dependency ... present in optimizeDeps.include").
      // Pre-bundling the package that owns the import resolves it from where it
      // actually lives.
      'mobx-react-lite',
    ],
    // Not excluding these seem to:
    //   a) always force a refresh after initial load: https://github.com/vitejs/vite/discussions/14801)
    //   b) optimize an old version!
    exclude: [
      '@hanzo/ui/primitives-common',
      '@hanzo/ui/util',
    ]
  },
  // https://github.com/remix-run/remix/issues/10156#issuecomment-2440234744
  server: {
    warmup: {
      clientFiles: ['app/**/*.tsx'],
    },
  },
  build: {
    sourcemap: true, // Enable source maps in production build
    rollupOptions: {
      output: {
        sourcemapExcludeSources: false, // Include source content in the map
      },
    },
  },
})
