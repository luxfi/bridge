import React from 'react'
import { swapStatusAtom } from '@/store/teleport'
//hooks
import { useAtom } from 'jotai'
//types
import UserTokenDepositor from './progress/TokenDepositor'
import TeleportProcessor from './progress/TeleportProcessor'
import PayoutProcessor from './progress/PayoutProcessor'
import SwapSuccess from './progress/SwapSuccess'
import XrplPayoutProcessor from './progress/XrplPayoutProcessor'
import { SwapStatus } from '@/Models/SwapStatus'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'
import { NetworkType } from '@/Models/CryptoNetwork'

interface IProps {
  className?: string
  sourceNetwork: CryptoNetwork
  sourceAsset: NetworkCurrency
  destinationNetwork: CryptoNetwork
  destinationAsset: NetworkCurrency
  destinationAddress: string
  sourceAmount: string,
  swapId: string
}

const SwapDetails: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  swapId
}) => {
  //atoms
  const [swapStatus] = useAtom(swapStatusAtom)

  //chain id
  if (swapStatus === SwapStatus.UserTransferPending) {
    return (
      <UserTokenDepositor
        sourceNetwork={sourceNetwork}
        sourceAsset={sourceAsset}
        destinationNetwork={destinationNetwork}
        destinationAsset={destinationAsset}
        destinationAddress={destinationAddress}
        sourceAmount={sourceAmount}
        swapId={swapId}
        className={className}
      />
    )
  } else if (swapStatus === SwapStatus.TeleportProcessPending) {
    return (
      <TeleportProcessor
        sourceNetwork={sourceNetwork}
        sourceAsset={sourceAsset}
        destinationNetwork={destinationNetwork}
        destinationAsset={destinationAsset}
        destinationAddress={destinationAddress}
        sourceAmount={sourceAmount}
        swapId={swapId}
        className={className}
      />
    )
  } else if (swapStatus === SwapStatus.UserPayoutPending) {
    // XRPL payout flow
    if (destinationNetwork.type === NetworkType.XRPL) {
      return (
        <XrplPayoutProcessor
          sourceNetwork={{
            type: sourceNetwork.type,
            chain_id: sourceNetwork.chain_id || undefined // Convert null to undefined
          }}
          destinationNetwork={{
            type: destinationNetwork.type
          }}
          destinationAddress={destinationAddress}
          sourceAmount={sourceAmount}
          swapId={swapId}
          className={className}
        />
      )
    }
    return (
      <PayoutProcessor
        sourceNetwork={sourceNetwork}
        sourceAsset={sourceAsset}
        destinationNetwork={destinationNetwork}
        destinationAsset={destinationAsset}
        destinationAddress={destinationAddress}
        sourceAmount={sourceAmount}
        swapId={swapId}
        className={className}
      />
    )
  } else if (swapStatus === SwapStatus.PayoutSuccess) {
    return (
      <SwapSuccess
        sourceNetwork={sourceNetwork}
        sourceAsset={sourceAsset}
        destinationNetwork={destinationNetwork}
        destinationAsset={destinationAsset}
        destinationAddress={destinationAddress}
        sourceAmount={sourceAmount}
        swapId={swapId}
        className={className}
      />
    )
  } else {
    return <></>
  }
}

export default SwapDetails
