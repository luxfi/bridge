#!/usr/bin/env node
// Validates that public/brand.json conforms to the Brand schema exported by
// the upstream bridge SDK (@luxfi/core).  Catches drift early — every required
// field must be present, optional fields may be omitted.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const brandPath = resolve(here, '..', 'public', 'brand.json')

const REQUIRED = [
  'name', 'title', 'description', 'shortName', 'legalEntity',
  'appDomain', 'twitter', 'github', 'discord', 'logoUrl', 'faviconUrl',
]

const raw = await readFile(brandPath, 'utf-8')
const cfg = JSON.parse(raw)
const brand = cfg.brand ?? {}

const missing = REQUIRED.filter(k => !brand[k])
if (missing.length) {
  console.error(`✗ brand.json missing required fields: ${missing.join(', ')}`)
  process.exit(1)
}
if (!cfg.chains?.defaultChainId) {
  console.error('✗ brand.json missing chains.defaultChainId')
  process.exit(1)
}
console.log(`✓ brand.json valid — ${brand.name} on ${brand.appDomain}`)
