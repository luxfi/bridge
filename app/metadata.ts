import type { Metadata } from 'next'

export default {
  metadataBase: new URL('https://bridge.lux.network'),
  title: {
    default: 'Lux Bridge',
    template: '%s | Bridge',
  },
  description: 'Lux Network Blockchain Bridge - Seamless Multi-Chain Connectivity for EVM, Solana, Bitcoin, and more. Secure, Efficient Cross-Chain Transactions.',
  applicationName: 'Lux Bridge',
  authors: {name: 'Lux Dev team'},
  keywords: "Lux Network, Blockchain Bridge, Multi-Chain, EVM, Solana, Bitcoin, Cross-Chain, Interoperability, Cryptocurrency, Blockchain Technology",
  themeColor: { media: "(prefers-color-scheme: dark)", color: "#000000" },
  icons: [
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '16x16',
      url: '/assets/lux-site-icons/favicon-16x16.png'   
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      url: '/assets/lux-site-icons/favicon-32x32.png'   
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '192x192',
      url: '/assets/lux-site-icons/android-chrome-192x192.png'   
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '512x512',
      url: '/assets/lux-site-icons/android-chrome-512x512.png'   
    },
    {
      rel: 'apple-touch-icon',
      type: 'image/png',
      sizes: "180x180",
      url: '/assets/lux-site-icons/apple-touch-icon.png'  
    },
  ],
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'Lux Network Blockchain Bridge - Unifying Multiple Blockchains',
    description: "Connect across EVM, Solana, Bitcoin, and other blockchains with Lux Network's advanced bridge technology. Experience secure and efficient cross-chain functionality.",
    images: 'https://bridge.lux.network/assets/img/opengraph-lux.jpg',
    type: 'website',
    url: "https://bridge.lux.network",

  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lux Network Blockchain Bridge - Unifying Multiple Blockchains',
    description: "Experience seamless multi-chain connectivity with Lux Network's Blockchain Bridge. EVM, Solana, Bitcoin, and more, united.",
    images: 'https://bridge.lux.network/assets/img/opengraph-lux.jpg',
    site: '@luxdefi'
  },

  formatDetection: { telephone: false },
  other: {
    'msapplication-TileColor': '#000000'
  }

} as Metadata