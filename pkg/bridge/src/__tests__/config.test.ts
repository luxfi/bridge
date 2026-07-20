// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { beforeEach, describe, expect, it } from 'vitest'

import { applyBrandMetadata, setConfig } from '../config'
import type { BridgeConfig } from '../types'

const base: BridgeConfig = {
  apiHost: 'https://api.example.test',
  env: 'testnet',
}

describe('setConfig precedence guard', () => {
  it('accepts matching top-level clientId and auth.clientId', () => {
    expect(() =>
      setConfig({
        ...base,
        clientId: 'tenant-app',
        auth: {
          provider: 'iam',
          issuer: 'https://iam.example.test',
          clientId: 'tenant-app',
        },
      }),
    ).not.toThrow()
  })

  it('throws when top-level clientId conflicts with auth.clientId', () => {
    expect(() =>
      setConfig({
        ...base,
        clientId: 'legacy-app',
        auth: {
          provider: 'iam',
          issuer: 'https://iam.example.test',
          clientId: 'new-app',
        },
      }),
    ).toThrow(/conflicting clientId/)
  })

  it('accepts matching iamOrg and auth.orgSlug', () => {
    expect(() =>
      setConfig({
        ...base,
        iamOrg: 'lux',
        auth: {
          provider: 'iam',
          issuer: 'https://iam.example.test',
          clientId: 'tenant-app',
          orgSlug: 'lux',
        },
      }),
    ).not.toThrow()
  })

  it('throws when iamOrg conflicts with auth.orgSlug', () => {
    expect(() =>
      setConfig({
        ...base,
        iamOrg: 'lux',
        auth: {
          provider: 'iam',
          issuer: 'https://iam.example.test',
          clientId: 'tenant-app',
          orgSlug: 'hanzo',
        },
      }),
    ).toThrow(/conflicting org/)
  })

  it('accepts config with only top-level clientId set', () => {
    expect(() =>
      setConfig({
        ...base,
        clientId: 'legacy-only',
      }),
    ).not.toThrow()
  })

  it('accepts config with only auth.clientId set', () => {
    expect(() =>
      setConfig({
        ...base,
        auth: {
          provider: 'iam',
          issuer: 'https://iam.example.test',
          clientId: 'new-only',
        },
      }),
    ).not.toThrow()
  })

  it('accepts config with neither clientId nor iamOrg', () => {
    expect(() => setConfig({ ...base })).not.toThrow()
  })
})

describe('applyBrandMetadata white-labels the head', () => {
  beforeEach(() => {
    // Mimic index.html: ships the Lux default title + description.
    document.head.innerHTML =
      '<title>Lux Bridge</title>' +
      '<meta name="description" content="Cross-chain bridge for the Lux Network." />'
  })

  const joinedMetaContent = () =>
    Array.from(document.querySelectorAll('meta[content]'))
      .map((m) => m.getAttribute('content') || '')
      .join(' | ')

  it('overwrites the title + description metas from the brand block', () => {
    applyBrandMetadata({
      name: 'Zoo Bridge',
      description: 'Cross-chain bridge for the Zoo Network.',
    })
    expect(document.title).toBe('Zoo Bridge')
    for (const sel of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      expect(document.querySelector(sel)?.getAttribute('content')).toBe(
        'Cross-chain bridge for the Zoo Network.',
      )
    }
  })

  it('creates og/twitter description metas when absent (no duplicates on re-apply)', () => {
    const brand = { name: 'Pars Bridge', description: 'Cross-chain bridge for the Pars Network.' }
    applyBrandMetadata(brand)
    applyBrandMetadata(brand)
    expect(document.querySelectorAll('meta[property="og:description"]')).toHaveLength(1)
    expect(document.querySelectorAll('meta[name="twitter:description"]')).toHaveLength(1)
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  })

  it('leaves ZERO foreign-brand leak in the head (the white-label invariant)', () => {
    applyBrandMetadata({
      name: 'Zoo Bridge',
      description: 'Cross-chain bridge for the Zoo Network.',
    })
    const head = document.title + ' | ' + joinedMetaContent()
    for (const foreign of ['Lux', 'Hanzo', 'Pars']) {
      expect(new RegExp('\\b' + foreign + '\\b').test(head)).toBe(false)
    }
    expect(head).toContain('Zoo')
  })

  it('is a no-op when brand is undefined', () => {
    expect(() => applyBrandMetadata(undefined)).not.toThrow()
    expect(document.title).toBe('Lux Bridge')
  })
})

describe('setConfig accepts every supported MPC protocol', () => {
  const protocols = [
    'cggmp21',
    'frost',
    'bls',
    'doerner',
    'pulsar',
    'corona',
    'magnetar',
  ] as const

  it.each(protocols)('accepts protocol=%s', (protocol) => {
    expect(() =>
      setConfig({
        ...base,
        mpc: { publicUrl: 'https://mpc.example.test', protocol },
      }),
    ).not.toThrow()
  })
})
