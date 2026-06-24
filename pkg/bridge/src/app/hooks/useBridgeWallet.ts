// useBridgeWallet — unified connect surface across every bridge chain.
//
// The bridge has two wallet stacks (see lib/wallet-family.ts):
//   • wagmi (useWallet)        — EVM + Lux. Signs the EVM deposit leg.
//   • @luxwallet/connect       — Solana / Bitcoin / TON / XRP / Polkadot.
//     Connect + SIWx identity for the ecosystems wagmi can't reach.
//
// This hook composes both behind one `BridgeWallet` value. The UI asks for a
// connect against the *currently selected source chain*; the hook routes to
// the stack that owns that chain's family. `address` reflects whichever stack
// is connected for the active family, so SwapForm's existing
// `wallet.address`/`canSubmit` logic now works for ALL six ecosystems, not
// just EVM.
//
// Composition over inheritance: it does not reimplement either stack — it
// holds both hooks' state and dispatches by family. wagmi remains the source
// of truth for the EVM leg; useLuxWallet for the rest.

import { useCallback, useMemo } from 'react'
import type { LoginChallenge, LoginResult } from '@luxwallet/connect'

import type { ChainFamily } from '../lib/chains'
import { isEvmFamily } from '../lib/wallet-family'
import { useWallet, type WalletState } from './useWallet'
import { useLuxWallet, type LuxWalletState, type UseLuxWalletOptions } from './useLuxWallet'

export interface BridgeWallet {
  /** The wagmi (EVM/Lux) wallet — unchanged signer for the EVM deposit leg. */
  evm: WalletState
  /** The @luxwallet/connect (non-EVM) wallet. */
  nonEvm: LuxWalletState
  /**
   * Address connected for `family`, or null. EVM/Lux read wagmi; every other
   * family reads the non-EVM connector (and only when it matches `family`).
   */
  addressFor: (family: ChainFamily) => string | null
  /** True when a wallet is connected for `family`. */
  isConnected: (family: ChainFamily) => boolean
  /** True while either stack has a handshake in flight. */
  connecting: boolean
  /**
   * Connect a wallet for `family` against the right stack. EVM/Lux → wagmi
   * picker is used (see WalletConnect.tsx connectWith), so this routes only
   * the non-EVM families; EVM is handled by the wagmi picker UI directly and
   * throws here to keep the one-way contract explicit.
   */
  connectNonEvm: (family: ChainFamily) => Promise<string>
  /** Disconnect whichever stack owns `family`. */
  disconnect: (family: ChainFamily) => Promise<void>
  /** SIWx login for a non-EVM family (no WalletConnect / projectId). */
  loginNonEvm: (family: ChainFamily, challenge: LoginChallenge) => Promise<LoginResult>
}

export function useBridgeWallet(opts: UseLuxWalletOptions = {}): BridgeWallet {
  const evm = useWallet()
  const nonEvm = useLuxWallet(opts)

  const addressFor = useCallback(
    (family: ChainFamily): string | null => {
      if (isEvmFamily(family)) return evm.address
      // Non-EVM: only report the address when the connected family matches the
      // requested one — a Solana wallet must not satisfy a Bitcoin source.
      return nonEvm.family === family ? nonEvm.address : null
    },
    [evm.address, nonEvm.address, nonEvm.family],
  )

  const isConnected = useCallback(
    (family: ChainFamily): boolean => addressFor(family) !== null,
    [addressFor],
  )

  const connectNonEvm = useCallback(
    (family: ChainFamily): Promise<string> => {
      if (isEvmFamily(family)) {
        throw new Error(
          'useBridgeWallet: EVM/Lux connect goes through the wagmi picker ' +
            '(WalletConnect.tsx), not connectNonEvm',
        )
      }
      return nonEvm.connect(family)
    },
    [nonEvm],
  )

  const disconnect = useCallback(
    async (family: ChainFamily): Promise<void> => {
      if (isEvmFamily(family)) {
        await evm.disconnect()
        return
      }
      await nonEvm.disconnect()
    },
    [evm, nonEvm],
  )

  const loginNonEvm = useCallback(
    (family: ChainFamily, challenge: LoginChallenge): Promise<LoginResult> =>
      nonEvm.login(family, challenge),
    [nonEvm],
  )

  return useMemo(
    () => ({
      evm,
      nonEvm,
      addressFor,
      isConnected,
      connecting: evm.connecting || nonEvm.connecting,
      connectNonEvm,
      disconnect,
      loginNonEvm,
    }),
    [evm, nonEvm, addressFor, isConnected, connectNonEvm, disconnect, loginNonEvm],
  )
}
