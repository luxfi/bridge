import React from 'react'
import toast from 'react-hot-toast'
import { depositAddressAtom, depositActionsAtom } from '@/store/utila'
import Gauge from '@/components/gauge'
import SuccessIcon from '../SuccessIcon'
import DepositActionItem from '@/components/lux/utila/share/DepositActionItem'
import SpinIcon from "@/components/icons/spinIcon"
import { ArrowRight } from "lucide-react"
//hooks
import type { DepositAction, Network, Token } from '@/types/utila'
import useAsyncEffect from 'use-async-effect'
import SwapItems from './SwapItems'
import { useAtom } from 'jotai'
import { useEthersSigner } from '@/lib/ethersToViem/ethers'
import { useServerAPI } from '@/hooks/useServerAPI'
interface IProps {
  className?: string
  sourceNetwork: Network
  sourceAsset: Token
  destinationNetwork: Network
  destinationAsset: Token
  destinationAddress: string
  sourceAmount: string
  swapId: string
  getSwapById: (swapId: string) => void
}

const BridgeProcessor: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  swapId,
  getSwapById,
}) => {
  //hooks
  const { serverAPI } = useServerAPI()
  //atoms
  const signer = useEthersSigner()
  // time to expire
  const [depositAddress] = useAtom(depositAddressAtom)
  const [depositActions] = useAtom(depositActionsAtom)

  const [isFailed, setIsFailed] = React.useState<boolean>(false);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  const FailedIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="-ml-1"
      width="60"
      height="60"
      viewBox="0 0 300 300"
      fill="none"
    >
      <circle cx="150" cy="150" r="150" fill="#E43636" fillOpacity="0.3" />
      <circle cx="150" cy="150" r="120" fill="#E43636" fillOpacity="0.5" />
      <circle cx="150" cy="150" r="100" fill="#E43636" />
    </svg>
  )

  React.useEffect(() => {
    // handlePayOut ()
  }, [])

  const handlePayOut = async () => {
    if (isLoading) return
    try {
      setIsLoading(true);
      const { data } = await serverAPI.get(`/v1/utila/payout/${swapId}`)
      console.log(data)
      if (data.status === 'success') {
        getSwapById(swapId)
      } else {
        setIsFailed (true)
      }
    } catch (err) {
      setIsFailed (true)
      console.log("::Issue when running payout", err)
    } finally {
      setIsLoading(false)
    }
  }

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
        {
          isFailed ?
          <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
            <FailedIcon/>
            <div className="mt-2">Failed to run payout Process</div>
          </div> :
          <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
            <span className="animate-spin">
              <Gauge value={60} size="medium" />
            </span>
            <div className="mt-2">Bridge is Processing your Deposit</div>
          </div>
        }

        <div className="flex flex-col px-2 gap-1">
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
      <button
        disabled={isLoading}
        onClick={handlePayOut}
        className="border mt-5 border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
      >
        {isLoading ? (
          <SpinIcon className="animate-spin h-5 w-5" />
        ) : (
          <ArrowRight />
        )}
        <span className="grow">
          Get Your {" "} {destinationAsset?.asset}
        </span>
      </button>
    </div>
  )
}

export default BridgeProcessor
