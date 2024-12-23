import React from 'react'
import { swapStatusAtom, swapIdAtom } from '@/store/utila'
//hooks
import { useAtom } from 'jotai'
//types
import type { Network, Token } from '@/types/utila'
//components
import UserTokenDepositor from './progress/TokenDepositor'
import SwapSuccess from './progress/SwapSuccess'
import SwapExpired from './progress/SwapExpired'
import { SwapStatus } from '@/Models/SwapStatus'
import BridgeProcessor from './progress/BridgeProcessor'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'

interface IProps {
  className?: string;
  sourceNetwork: CryptoNetwork;
  sourceAsset: NetworkCurrency;
  destinationNetwork: CryptoNetwork;
  destinationAsset: NetworkCurrency;
  destinationAddress: string;
  sourceAmount: string;
  getSwapById: (swapId: string) => void
}

const SwapDetails: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  getSwapById
}) => {
  //atoms
  const [swapStatus] = useAtom(swapStatusAtom);
  const [swapId] = useAtom(swapIdAtom);
  console.log(swapStatus)
  //chain id
  if (swapStatus === SwapStatus.UserDepositPending) {
    return (
      <UserTokenDepositor
        sourceNetwork={sourceNetwork}
        sourceAsset={sourceAsset}
        destinationNetwork={destinationNetwork}
        destinationAsset={destinationAsset}
        destinationAddress={destinationAddress}
        sourceAmount={sourceAmount}
        swapId={swapId}
        getSwapById={getSwapById}
        className={className}
      />
    );
  } else if (swapStatus === SwapStatus.BridgeTransferPending) {
    return (
      <BridgeProcessor
        sourceNetwork={sourceNetwork}
        sourceAsset={sourceAsset}
        destinationNetwork={destinationNetwork}
        destinationAsset={destinationAsset}
        destinationAddress={destinationAddress}
        sourceAmount={sourceAmount}
        swapId={swapId}
        getSwapById={getSwapById}
        className={className}
      />
    );
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
    );
  } else if (swapStatus === SwapStatus.Expired) {
    return (
      <SwapExpired
        sourceNetwork={sourceNetwork}
        sourceAsset={sourceAsset}
        destinationNetwork={destinationNetwork}
        destinationAsset={destinationAsset}
        destinationAddress={destinationAddress}
        sourceAmount={sourceAmount}
        swapId={swapId}
        className={className}
      />
    );
  } else {
    return <></>;
  }
};

export default SwapDetails;
