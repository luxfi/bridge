// @ts-nocheck
import useXRPLWallet from './useXRPLWallet'

describe('useXRPLWallet adapter', () => {
  it('should return a WalletProvider with correct shape', () => {
    const provider = useXRPLWallet()
    expect(provider.name).toBe('XRPL')
    expect(Array.isArray(provider.autofillSupportedNetworks)).toBe(true)
    expect(typeof provider.connectWallet).toBe('function')
    expect(typeof provider.disconnectWallet).toBe('function')
    expect(typeof provider.getConnectedWallet).toBe('function')
  })
})