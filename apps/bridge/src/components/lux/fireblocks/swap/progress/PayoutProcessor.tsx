import React from "react";
import {
  swapStatusAtom,
  mpcSignatureAtom,
  bridgeMintTransactionAtom,
  userTransferTransactionAtom,
} from "@/store/fireblocks";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
//hooks
import { useAtom } from "jotai";
import { useEthersSigner } from "@/lib/ethersToViem/ethers";

import useWallet from "@/hooks/useWallet";
import SwapItems from "./SwapItems";
import shortenAddress from "@/components/utils/ShortenAddress";
import SpinIcon from "@/components/icons/spinIcon";
import Gauge from "@/components/gauge";
import type { Network, Token } from "@/types/fireblocks";
import { ArrowRight } from "lucide-react";

interface IProps {
  className?: string;
  sourceNetwork: Network;
  sourceAsset: Token;
  destinationNetwork: Network;
  destinationAsset: Token;
  destinationAddress: string;
  sourceAmount: string;
  swapId: string;
}

const PayoutProcessor: React.FC<IProps> = ({
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
  const [isGettingPayout, setIsGettingPayout] = React.useState<boolean>(false);
  //atoms
  const [, setBridgeMintTransactionHash] = useAtom(bridgeMintTransactionAtom);
  const [userTransferTransaction] = useAtom(userTransferTransactionAtom);
  const [swapStatus, setSwapStatus] = useAtom(swapStatusAtom);
  const [mpcSignature] = useAtom(mpcSignatureAtom);
  //hooks
  const signer = useEthersSigner();
  const { connectWallet } = useWallet();

  const isWithdrawal = React.useMemo(
    () => (sourceAsset.name.startsWith("Lux") ? true : false),
    [sourceAsset]
  );

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
        <div>
          <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
            <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
              <span className="animate-spin">
                <Gauge value={60} size="medium" />
              </span>
              <div className="mt-2">
                {isWithdrawal ? "Withdraw" : "Get"} Your{" "}
                {destinationAsset.asset}
              </div>
            </div>
            <div className="flex flex-col gap-2 py-5">
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-center text-sm">
                  <span>
                    {sourceAsset?.asset}{" "}
                    {isWithdrawal ? "burnt" : "transferred"}
                  </span>
                  <div className="underline flex gap-2 items-center">
                    {shortenAddress(userTransferTransaction)}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          target={"_blank"}
                          href={sourceNetwork?.transaction_explorer_template?.replace(
                            "{0}",
                            userTransferTransaction
                          )}
                          className="cursor-pointer"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-square-arrow-out-up-right"
                          >
                            <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
                            <path d="m21 3-9 9" />
                            <path d="M15 3h6v6" />
                          </svg>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Transaction</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-center text-sm">
                  <span>
                    Teleporter has confirmed your token{" "}
                    {isWithdrawal ? "burn" : "deposit"}
                  </span>
                </div>
              </div>
            </div>
            <button
              disabled={isGettingPayout}
              className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
            >
              {isGettingPayout ? (
                <SpinIcon className="animate-spin h-5 w-5" />
              ) : (
                <ArrowRight />
              )}
              <span className="grow">
                {isWithdrawal ? "Withdraw" : "Get"} Your{" "}
                {destinationAsset?.asset}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayoutProcessor;
