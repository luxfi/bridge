import React from "react";
import {
  depositAddressAtom,
  timeToExpireAtom,
} from "@/store/utila";

//hooks
import { useAtom } from "jotai";
import SwapItems from "./SwapItems";
import ManualTransfer from "./ManualTransfer";
import type { CryptoNetwork, NetworkCurrency } from "@/Models/CryptoNetwork";

interface IProps {
  className?: string
  sourceNetwork: CryptoNetwork
  sourceAsset: NetworkCurrency
  destinationNetwork: CryptoNetwork
  destinationAsset: NetworkCurrency
  destinationAddress: string
  sourceAmount: string
  swapId: string
}

const UserTokenDepositor: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  swapId,
}) => {
  //state
  const [distance, setDistance] = React.useState<number>(0);
  //atoms
  const [depositAddress] = useAtom(depositAddressAtom)
  const [timeToExpire] = useAtom(timeToExpireAtom);

  return (
    <div className={`w-full flex flex-col ${className}`}>
      <div className="space-y-5">
        <div className="w-full flex flex-col space-y-5">
          <SwapItems
            sourceNetwork={sourceNetwork}
            sourceAsset={sourceAsset}
            destinationNetwork={destinationNetwork}
            destinationAsset={destinationAsset}
            destinationAddress={destinationAddress}
            sourceAmount={sourceAmount}
          />
        </div>
        <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
          <svg xmlns="http://www.w3.org/2000/svg" width="5em" height="5em" viewBox="0 0 24 24">
            <path fill="currentColor" d="m19.95 17.15l-1.5-1.5q.275-.675.413-1.337T19 13q0-2.9-2.05-4.95T12 6q-.6 0-1.275.125t-1.4.4l-1.5-1.5q.95-.5 2.012-.763T12 4q1.5 0 2.938.5t2.712 1.45l1.4-1.4l1.4 1.4l-1.4 1.4q.95 1.275 1.45 2.713T21 13q0 1.05-.262 2.088t-.788 2.062M13 10.2V8h-2v.2zm6.8 12.4l-2.4-2.4q-1.2.875-2.588 1.338T12 22q-1.85 0-3.488-.712T5.65 19.35t-1.937-2.863T3 13q0-1.5.463-2.887T4.8 7.6L1.4 4.2l1.4-1.4l18.4 18.4zM12 20q1.05 0 2.05-.325t1.875-.925L6.2 9.025q-.6.875-.9 1.875T5 13q0 2.9 2.05 4.95T12 20M9 3V1h6v2zm4.9 8.075"></path>
          </svg>
          <div className="text-sm !mt-2 flex gap-2 items-center text-[#22C55E]">
            { new Date(timeToExpire).toUTCString() }
          </div>
          <div className="flex flex-col gap-1 justify-center items-center opacity-80">
            <div className='text-md text-left text-xs md:text-sm '>The transfer wasn&apos;t completed during the allocated timeframe.</div>
            <div className="text-center"><span> If you&apos;ve already sent crypto for this swap, your funds are safe, </span><a className='underline hover:cursor-pointer'>please contact our support team.</a></div>
          </div>
        </div>
        
        <ManualTransfer
          sourceNetwork={sourceNetwork}
          sourceAsset={sourceAsset}
          destinationNetwork={destinationNetwork}
          destinationAsset={destinationAsset}
          destinationAddress={destinationAddress}
          depositAddress={depositAddress}
          sourceAmount={sourceAmount}
          swapId={swapId}
        />
      </div>
    </div>
  );
};

export default UserTokenDepositor;
