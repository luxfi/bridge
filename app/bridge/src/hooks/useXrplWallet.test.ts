// @ts-nocheck
import { renderHook } from '@testing-library/react-hooks'
import { useXrplWallet } from './useXrplWallet'

describe('useXrplWallet', () => {
  it('should expose XUMM & Ledger connection and payment methods', () => {
    const { result } = renderHook(() => useXrplWallet())
    expect(typeof result.current.connectXumm).toBe('function')
    expect(typeof result.current.connectLedger).toBe('function')
    expect(typeof result.current.sendPayment).toBe('function')
    expect(typeof result.current.disconnect).toBe('function')
  })
})