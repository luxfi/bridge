import { useAtom } from "jotai";

import {
    swapStatusAtom,
    swapIdAtom,
} from '@/store/teleport'
import type{  Network, Token } from '@/types/teleport';
import UserTokenDepositor from './progress/TokenDepositor';
import TeleportProcessor from './progress/TeleportProcessor';
import PayoutProcessor from './progress/PayoutProcessor';
import SwapSuccess from './progress/SwapSuccess';


const SwapDetails: React.FC<{
    className?: string,
    sourceNetwork: Network,
    sourceAsset: Token,
    destinationNetwork: Network,
    destinationAsset: Token,
    destinationAddress: string,
    sourceAmount: string
}> = ({
    sourceNetwork,
    sourceAsset,
    destinationNetwork,
    destinationAsset,
    destinationAddress,
    sourceAmount,
    className
}) => {
    //atoms
    const [swapStatus] = useAtom(swapStatusAtom);
    const [swapId] = useAtom(swapIdAtom);

    //chain id
    if (swapStatus === 'user_transfer_pending') {
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
    } else if (swapStatus === "teleport_processing_pending") {
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
    } else if (swapStatus === 'user_payout_pending') {
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
    } else if (swapStatus === 'payout_success') {
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
    }
}

export default SwapDetails;