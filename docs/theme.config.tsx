import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>Lux Bridge</span>,
  project: {
    link: 'https://github.com/luxfi/bridge',
  },
  chat: {
    link: 'https://discord.gg/luxnetwork',
  },
  docsRepositoryBase: 'https://github.com/luxfi/bridge/tree/main/docs',
  footer: {
    text: 'Lux Bridge Documentation',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Lux Bridge Documentation" />
      <meta property="og:description" content="Comprehensive documentation for the Lux Bridge - a decentralized cross-chain bridge using MPC" />
    </>
  ),
  sidebar: {
    titleComponent({ title, type }) {
      if (type === 'separator') {
        return <span className="cursor-default">{title}</span>
      }
      return <>{title}</>
    },
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
  navigation: {
    prev: true,
    next: true,
  },
  darkMode: true,
  primaryHue: 200,
  banner: {
    key: 'bridge-v1',
    text: (
      <a href="https://lux.network" target="_blank">
        🚀 Lux Bridge v1.0 is now live! Learn more →
      </a>
    ),
  },
}

export default config