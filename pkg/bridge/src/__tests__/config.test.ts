// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { describe, expect, it } from 'vitest'

import { setConfig } from '../config'
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
