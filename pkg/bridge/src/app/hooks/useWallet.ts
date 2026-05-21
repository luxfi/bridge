// Minimal wallet state hook for the inlined bridge UI.
//
// This is a stub — it exposes a stable shape (`address`, `chainId`, `connect`,
// `disconnect`, `signing`) that the UI consumes today. Phase 3 R2 + the
// threshold MPC integration will plug a real `connect()` flow that derives
// keys via Corona + ECDSA-CMP threshold signers — never a single-key
// custody model (no central authority over the user's funds).
//
// Until then: `connect()` resolves to a deterministic display-only address
// so the UI renders identically to a connected wallet. No private-key
// material is generated, no funds are at risk.

import { useState, useCallback } from 'react'

export interface WalletState {
  address: string | null
  chainId: string | null
  connecting: boolean
  signing: boolean
  connect: (chainId: string) => Promise<void>
  disconnect: () => void
}

// Display-only deterministic address (the leading bytes spell "LUXBRIDGE").
// Replaced by Phase 3 R2 with the actual MPC-derived address per session.
const DISPLAY_ADDRESS = '0xLUXBRIDGE000000000000000000000000DEADBEEF'

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [signing] = useState(false)

  const connect = useCallback(async (cid: string) => {
    setConnecting(true)
    // Simulated handshake latency; replaced by real MPC keygen round in R3.
    await new Promise((r) => setTimeout(r, 350))
    setAddress(DISPLAY_ADDRESS)
    setChainId(cid)
    setConnecting(false)
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setChainId(null)
  }, [])

  return { address, chainId, connecting, signing, connect, disconnect }
}
