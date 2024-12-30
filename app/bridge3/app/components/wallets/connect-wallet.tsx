import React from 'react'
import { useLux } from '@/contexts/luxkit'
import { useEthersSigner } from '@/contexts/ethers'


const ConnectWallets: React.FC = () => {
  const { connect } = useLux()
  const { chainId, address } = useEthersSigner()
  
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
