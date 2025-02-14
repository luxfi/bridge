import React from "react"
import SuccessIcon from "../SuccessIcon"
import { bridgeMintTransactionAtom } from "@/store/utila"
import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui/primitives'
//hooks
import Gauge from "@/components/gauge"
import SwapItems from "./SwapItems"
import shortenAddress from "@/components/utils/ShortenAddress"
import type { DepositAction } from "@/types/utila"
import { useAtom } from "jotai"
import { truncateDecimals } from "@/components/utils/RoundDecimals"

import {
  depositAddressAtom,
  swapStatusAtom,
  timeToExpireAtom,
  userTransferTransactionAtom,
  depositActionsAtom,
} from '@/store/utila'
import DepositActionItem from "../../share/DepositActionItem"
import type { CryptoNetwork, NetworkCurrency } from "@/Models/CryptoNetwork"

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

const SwapSuccess: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
}) => {
  //atoms
  const [bridgeMintTransactionHash, setBridgeMintTransactionHash] = useAtom(
    bridgeMintTransactionAtom
  )

  const isWithdrawal = React.useMemo(
    () => (sourceAsset?.name?.startsWith('Lux') ? true : false),
    [sourceAsset]
  )

  const [depositActions] = useAtom(depositActionsAtom)

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
              <div className="mt-5">
                <SuccessIcon />
              </div>
              <div className="!-mt-2">
                <span className=" text-[#7e8350] font-bold text-lg">
                  {sourceAsset.asset} -&gt; {destinationAsset.asset}
                </span>{" "}
                Swap Success
              </div>
            </div>
            <div className="flex flex-col py-5">
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-center text-sm">
                  <span>Lux Bridge confirmed your Deposit</span>
                </div>
              </div>
              <div className="flex flex-col px-10 gap-1">
                {depositActions.map((item: DepositAction) => (
                  <DepositActionItem
                    key={'deposit_action_' + item.id}
                    data={item}
                    network={sourceNetwork}
                    asset={sourceAsset}
                  />
                ))}
              </div>
            </div>
            <div className="flex mb-3">
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col text-sm">
                  <span>{isWithdrawal ? String(truncateDecimals(Number(sourceAmount) * 0.99, 6)) : String(truncateDecimals(Number(sourceAmount), 6))} {destinationAsset?.asset} has been arrived</span>
                  <div className="underline flex gap-2 items-center">
                    {shortenAddress(bridgeMintTransactionHash)}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          target={"_blank"}
                          href={destinationNetwork.transaction_explorer_template.replace(
                            "{0}",
                            bridgeMintTransactionHash
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SwapSuccess
