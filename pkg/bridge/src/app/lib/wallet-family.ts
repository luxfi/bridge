// Wallet-family routing — the seam between a bridge chain and the wallet
// stack that can connect/sign for it.
//
// The bridge UI speaks one chain vocabulary (`ChainFamily`: evm/lux/svm/
// btc/ton/xrp/cardano/substrate). Two distinct wallet stacks sit behind it:
//
//   • EVM leg  → wagmi (`useWallet`). Already wired for the *send* path
//     (connect + switchChain + signMessage of the deposit). Untouched.
//   • Non-EVM  → @luxwallet/connect (`getConnector(chain)`). The connect +
//     SIWx-identity layer for Solana / Bitcoin / TON / XRP / Polkadot —
//     ecosystems wagmi cannot reach at all.
//
// This module is the ONE place that decides which stack owns a family, so
// the picker, the hooks, and the swap form never re-derive that mapping.
//
// TODO(deps): @luxwallet/connect and @luxwallet/chains are consumed via
// `file:` deps (see pkg/bridge/package.json) until they are published to npm.
// When published, switch both to a pinned semver range (`^0.1.0` /
// `^0.0.x`) — no other change is needed; the import specifiers already use
// the published package names.

import type { Chain as LuxChain } from '@luxwallet/connect'

import type { ChainFamily } from './chains'

/**
 * Bridge families that wagmi signs for. `lux` is an EVM chain (the Lux
 * primary network), so it rides the same wagmi connector as `evm`.
 */
export function isEvmFamily(family: ChainFamily): boolean {
  return family === 'evm' || family === 'lux'
}

/**
 * Map a bridge `ChainFamily` to the `@luxwallet/connect` `Chain` value whose
 * connector can connect a wallet for it. Returns null for families the
 * connect SDK does not (yet) cover:
 *
 *   - `evm` / `lux`  → handled by wagmi, NOT routed here (returns null so a
 *     caller that asks "which luxwallet connector?" gets an honest "none").
 *   - `cardano`      → no connector in @luxwallet/connect today (the SDK has
 *     EVM and Lux return null and go through wagmi, which owns chain
 *     switching and transaction sending — @luxwallet/connect has neither.
 *
 * Every other non-EVM family maps to a real, MIT/Apache-licensed connector.
 */
export function familyToLuxChain(family: ChainFamily): LuxChain | null {
  switch (family) {
    case 'svm':
      return 'solana'
    case 'btc':
      return 'bitcoin'
    case 'ton':
      return 'ton'
    case 'xrp':
      return 'xrp'
    case 'substrate':
      return 'polkadot'
    case 'cardano':
      return 'cardano'
    case 'evm':
    case 'lux':
      return null
  }
}

/**
 * True when @luxwallet/connect can connect a wallet for this family. EVM/Lux
 * are connectable too, but via wagmi — `canLuxConnect` is specifically "does
 * the non-EVM connect path apply here".
 */
export function canLuxConnect(family: ChainFamily): boolean {
  return familyToLuxChain(family) !== null
}
