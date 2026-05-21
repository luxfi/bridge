// Transfer status hook — tracks in-flight cross-chain transfers.
//
// In production these state transitions come from streaming bridge backend
// events (MPC ceremony rounds, source chain inclusion, dest chain finality).
// Here we expose the shape the UI binds to so Phase 3 R3 can swap the
// `submit()` body without changing TransferStatus.tsx.

import { useState, useCallback } from 'react'

export type TransferPhase =
  | 'pending'       // submitted, waiting for source chain inclusion
  | 'signing'       // MPC threshold ceremony in progress
  | 'broadcasting'  // dest tx broadcast, waiting for finality
  | 'completed'     // dest finality reached
  | 'failed'        // any leg failed; .error has the reason

export interface Transfer {
  id: string
  fromChainId: string
  toChainId: string
  fromAssetId: string
  toAssetId: string
  inAmount: number
  outAmount: number
  phase: TransferPhase
  createdAt: number
  error?: string
}

export interface TransferState {
  transfers: Transfer[]
  active: Transfer | null
  submit: (t: Omit<Transfer, 'id' | 'phase' | 'createdAt'>) => Transfer
  clear: () => void
}

let _id = 0
function nextId(): string {
  _id += 1
  return `xfer_${Date.now().toString(36)}_${_id}`
}

export function useTransfers(): TransferState {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [active, setActive] = useState<Transfer | null>(null)

  const submit = useCallback(
    (t: Omit<Transfer, 'id' | 'phase' | 'createdAt'>) => {
      const x: Transfer = {
        ...t,
        id: nextId(),
        phase: 'pending',
        createdAt: Date.now(),
      }
      setTransfers((prev) => [x, ...prev])
      setActive(x)

      // Mock phase progression — Phase 3 R3 replaces this with real events.
      const advance = (phase: TransferPhase, after: number) => {
        setTimeout(() => {
          setTransfers((prev) =>
            prev.map((p) => (p.id === x.id ? { ...p, phase } : p)),
          )
          setActive((curr) => (curr && curr.id === x.id ? { ...curr, phase } : curr))
        }, after)
      }
      advance('signing', 600)
      advance('broadcasting', 1400)
      advance('completed', 2400)

      return x
    },
    [],
  )

  const clear = useCallback(() => {
    setTransfers([])
    setActive(null)
  }, [])

  return { transfers, active, submit, clear }
}
