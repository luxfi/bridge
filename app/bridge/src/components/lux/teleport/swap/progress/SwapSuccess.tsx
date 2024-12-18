import React from 'react'
import Gauge from '@/components/gauge'
import SwapItems from './SwapItems'
import SuccessIcon from '../SuccessIcon'
import shortenAddress from '@/components/utils/ShortenAddress'
import { useAtom } from 'jotai'
import { bridgeMintTransactionAtom, userTransferTransactionAtom } from '@/store/teleport'
import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui/primitives'
import { truncateDecimals } from '@/components/utils/RoundDecimals'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'

const SwapSuccess: React.FC<{
  className?: string
  sourceNetwork: CryptoNetwork
  sourceAsset: NetworkCurrency
  destinationNetwork: CryptoNetwork
  destinationAsset: NetworkCurrency
  destinationAddress: string
  sourceAmount: string
  swapId: string
}> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  swapId,
}) => {
  //atoms
  const [bridgeMintTransactionHash, setBridgeMintTransactionHash] = useAtom(
    bridgeMintTransactionAtom
  )
  const [userTransferTransaction] = useAtom(userTransferTransactionAtom)

  const toBurn = React.useMemo(
    () => ((sourceAsset.name.startsWith('Liquid ') || sourceAsset.name.startsWith('Zoo ')) ? true : false),
    [sourceAsset]
  )

  const toMint = React.useMemo(
    () => ((destinationAsset.name.startsWith('Liquid ') || destinationAsset.name.startsWith('Zoo ')) ? true : false),
    [destinationAsset]
  )

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="space-y-5 w-full">
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
                </span>{' '}
                Swap Success
              </div>
            </div>
            <div className="flex gap-3 items-start pt-5">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-start text-sm">
                  <span>
                    {`${truncateDecimals(Number(sourceAmount), 6)} ${sourceAsset?.asset} ${toBurn ? 'burnt' : 'transferred'}`}
                  </span>
                  <div className="underline flex gap-2 items-center">
                    {shortenAddress(userTransferTransaction)}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          target={'_blank'}
                          href={sourceNetwork?.transaction_explorer_template?.replace(
                            '{0}',
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
            <div className="flex py-5">
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-center text-sm">
                  <span>Teleporter has confirmed your Deposit</span>
                </div>
              </div>
            </div>
            <div className="flex mb-3">
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col text-sm">
                <span>{toMint ? String(truncateDecimals(Number(sourceAmount), 6)) : String(truncateDecimals(Number(sourceAmount) * 0.99, 6))} {destinationAsset?.asset} has been arrived</span>
                  <div className="underline flex gap-2 items-center">
                    {shortenAddress(bridgeMintTransactionHash)}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          target={'_blank'}
                          href={destinationNetwork.transaction_explorer_template.replace(
                            '{0}',
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
