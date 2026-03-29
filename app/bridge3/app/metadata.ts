// see https://remix.run/docs/ru/main/route/meta
// Brand defaults — overridden at runtime via brand.json (see brand.ts)

import { brand } from './brand'

export default [
  {
    title: brand.title,
  },
  {
    name: 'description',
    content: brand.description,
  },
  {
    name: 'application-name',
    content: brand.name,
  },
  {
    name: 'author',
    content: brand.legalEntity,
  },
  {
    name: 'keywords',
    content:
      'Blockchain Bridge, Multi-Chain, EVM, Solana, Bitcoin, Cross-Chain, Interoperability, Cryptocurrency, Blockchain Technology',
  },
]
