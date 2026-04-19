import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'next/link': path.resolve(__dirname, 'src/shims/next-link.tsx'),
      'next/navigation': path.resolve(__dirname, 'src/shims/next-navigation.ts'),
      'next/image': path.resolve(__dirname, 'src/shims/next-image.tsx'),
      'next/dynamic': path.resolve(__dirname, 'src/shims/next-dynamic.ts'),
      'next/headers': path.resolve(__dirname, 'src/shims/next-headers.ts'),
      'next/server': path.resolve(__dirname, 'src/shims/next-server.ts'),
      'next/font/google': path.resolve(__dirname, 'src/shims/next-font-google.ts'),
      '@next/mdx': path.resolve(__dirname, 'src/shims/next-mdx.ts'),
      '@sentry/nextjs': path.resolve(__dirname, 'src/shims/sentry-nextjs.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2_000,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  define: {
    // Many downstream deps read process.env.* at runtime — polyfill to empty object.
    'process.env': {},
  },
})
