import React from 'react'
import toast from 'react-hot-toast'
import {
  depositAddressAtom,
  swapStatusAtom,
  timeToExpireAtom,
  userTransferTransactionAtom,
  depositActionsAtom,
} from '@/store/utila'
import Gauge from '@/components/gauge'
import DepositActionItem from '@/components/lux/utila/share/DepositActionItem'
//hooks
import type { DepositAction, Network, Token } from '@/types/utila'
import useAsyncEffect from 'use-async-effect'
import ManualTransfer from './ManualTransfer'
import SwapItems from './SwapItems'
import { useAtom } from 'jotai'
import { useEthersSigner } from '@/lib/ethersToViem/ethers'
import { useServerAPI } from '@/hooks/useServerAPI'
import { formatNumber } from '@/lib/utils'
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

const UserTokenDepositor: React.FC<IProps> = ({
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
  //state
  const [distance, setDistance] = React.useState<number>(0)
  // timerRef
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  //atoms
  const signer = useEthersSigner()
  // time to expire
  const [timeToExpire] = useAtom(timeToExpireAtom)
  const [depositAddress] = useAtom(depositAddressAtom)
  const [depositActions] = useAtom(depositActionsAtom)

  React.useEffect(() => {
    if (timeToExpire <= 0) return
    timerRef.current = setInterval(async () => {
      const _now = Date.now()
      const _distance = timeToExpire - _now
      setDistance(_distance / 1000)
      if (_distance < 0 || isNaN(_distance)) {
        timerRef.current && clearInterval(timerRef.current)
      }
    }, 1000)
    return () => {
      timerRef.current && clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeToExpire])

  useAsyncEffect(async () => {
    try {
      if (distance >= 0) return
      const { data } = await serverAPI.put(`/api/swaps/expire/${swapId}`)
      if (data?.status === 'success') {
        getSwapById(swapId)
      }
    } catch (err) {
      console.log('::error while making swap expire', err)
    }
  }, [distance])

  const [days, hours, minutes, seconds] = React.useMemo(() => {
    let days: string | number = Math.floor(distance / (60 * 60 * 24))
    let hours: string | number = Math.floor(
      (distance % (60 * 60 * 24)) / (60 * 60)
    )
    let minutes: string | number = Math.floor((distance % (60 * 60)) / 60)
    let seconds: string | number = Math.floor(distance % 60)

    days = days > 9 ? days : days > 0 ? '0' + days : '00'
    hours = hours > 9 ? hours : hours > 0 ? '0' + hours : '00'
    minutes = minutes > 9 ? minutes : minutes > 0 ? '0' + minutes : '00'
    seconds = seconds > 9 ? seconds : seconds > 0 ? '0' + seconds : '00'

    return [days, hours, minutes, seconds]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance])

  const [confirmedAmount, unconfirmedAmount] = React.useMemo(() => {
    let confirmedAmount = 0
    let unconfirmedAmount = 0
    depositActions.forEach((item: DepositAction) => {
      if (item.status === 'CONFIRMED') {
        confirmedAmount += item.amount
      } else {
        unconfirmedAmount += item.amount
      }
    })
    return [confirmedAmount, unconfirmedAmount]
  }, [depositActions])

  const neededAmount = React.useMemo(() => Number(sourceAmount) - confirmedAmount - unconfirmedAmount, [confirmedAmount, unconfirmedAmount])

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
          <span className="animate-spin">
            <Gauge value={60} size="medium" />
          </span>
          <div className="mt-2">Waiting for your Deposit</div>
          <div className="text-sm !mt-2 flex gap-2 items-center">
            <span>Deposit Expiration Time: </span>
            <div className="flex gap-1 text-[#22C55E]">
              <span>{days}d</span>
              <span>{hours}h</span>
              <span>{minutes}m</span>
              <span>{seconds}s</span>
            </div>
          </div>
          <div className="text-sm px-2 text-center">
            {formatNumber(confirmedAmount)}{' '}
            <span className="text-[#22C55E]">{sourceAsset.asset}</span>{' '}
            Confirmed,{'  '}
            {formatNumber(unconfirmedAmount)}{' '}
            <span className="text-[#22C55E]">{sourceAsset.asset}</span>{' '}
            Processing From LUX.
            <br />( You need to send{' '}
            {formatNumber(
              neededAmount >=0 ? neededAmount : 0
            )}{' '}
            <span className="text-[#22C55E]">{sourceAsset.asset}</span> to the
            following address )
          </div>
        </div>

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
  )
}

export default UserTokenDepositor
