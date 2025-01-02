import React from 'react'
import { useLux } from '@/contexts/luxkit'
import { useAccount } from 'wagmi'

const ConnectWallets: React.FC = () => {
  const { connect } = useLux()
  const { address } = useAccount()
  
  return (
    <div>
      <button
        onClick={connect}
      >
        Connect Wallet {address}
      </button>
    </div>
  )
}

export default ConnectWallets
