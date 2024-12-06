'use client'
import React from 'react'
import axios from 'axios'
import Modal from '../../modal/modal'
import SwapDetails from './swap/SwapDetails'
import ResizablePanel from '../../ResizablePanel'
import ConnectNetwork from '@/components/ConnectNetwork'
// networks
import mainNetworks from '@/components/lux/utila/constants/networks.mainnets'
import devNetworks from '@/components/lux/utila/constants/networks.sandbox'
import Widget from '@/components/Widget'
import {
  sourceNetworkAtom,
  sourceAssetAtom,
  destinationNetworkAtom,
  destinationAssetAtom,
  destinationAddressAtom,
  sourceAmountAtom,
  ethPriceAtom,
  swapStatusAtom,
  swapIdAtom,
  mpcSignatureAtom,
  bridgeMintTransactionAtom,
  userTransferTransactionAtom,
  timeToExpireAtom,
  depositAddressAtom,
  depositActionsAtom,
} from '@/store/utila'
import { useAtom } from 'jotai'
import type { Network, Token } from '@/types/utila'
import { SwapStatus } from '@/Models/SwapStatus'
import { useServerAPI } from '@/hooks/useServerAPI'

type NetworkToConnect = {
  DisplayName: string
  AppURL: string
}

interface IProps {
  swapId?: string
  className?: string
}

const Form: React.FC<IProps> = ({ swapId, className }) => {
  const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === 'mainnet'
  const { sourceNetworks, destinationNetworks } = isMainnet
    ? mainNetworks
    : devNetworks

  const [sourceNetwork, setSourceNetwork] = useAtom(sourceNetworkAtom)
  const [sourceAsset, setSourceAsset] = useAtom(sourceAssetAtom)
  const [destinationNetwork, setDestinationNetwork] = useAtom(
    destinationNetworkAtom
  )
  const [destinationAsset, setDestinationAsset] = useAtom(destinationAssetAtom)
  const [destinationAddress, setDestinationAddress] = useAtom(
    destinationAddressAtom
  )
  const [sourceAmount, setSourceAmount] = useAtom(sourceAmountAtom)
  const [swapStatus, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setEthPrice] = useAtom(ethPriceAtom)
  const [, setSwapId] = useAtom(swapIdAtom)
  const [, setUserTransferTransaction] = useAtom(userTransferTransactionAtom)
  const [, setBridgeMintTransactionHash] = useAtom(bridgeMintTransactionAtom)
  const [, setTimeToExpire] = useAtom(timeToExpireAtom)
  const [, setDepositAddress] = useAtom(depositAddressAtom)
  const [, setDepositActions] = useAtom(depositActionsAtom)

  const { serverAPI } = useServerAPI()

  // timerRef
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  React.useEffect(() => {
    if (!swapId) return

    if (swapStatus === SwapStatus.UserDepositPending) {
      timerRef.current = setInterval(async () => {
        getSwapByIdForDepositChecking(swapId)
      }, 10 * 1000)
    } else {
      timerRef.current && clearInterval(timerRef.current)
    }

    return () => {
      timerRef.current && clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapStatus, swapId])

  React.useEffect(() => {
    if (sourceAsset) {
      serverAPI.get(`/api/tokens/price/${sourceAsset.asset}`).then((data) => {
        setEthPrice(Number(data?.data?.data?.price))
      })
    }
  }, [sourceAsset])

  const getSwapByIdForDepositChecking = async (swapId: string) => {
    try {
      const {
        data: { data },
      } = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/${swapId}?version=${process.env.NEXT_PUBLIC_API_VERSION}`
      )

      setSwapStatus(data.status)
      setDepositActions(data.deposit_actions)
      const userTransferTransaction = data?.transactions?.find(
        (t: any) => t.status === 'user_transfer'
      )?.transaction_hash
      setUserTransferTransaction(userTransferTransaction ?? '')
      const payoutTransaction = data?.transactions?.find(
        (t: any) => t.status === 'payout'
      )?.transaction_hash
      setBridgeMintTransactionHash(payoutTransaction ?? '')

      console.log('::swap data fetched')
    } catch (err) {
      console.log(err)
    }
  }

  const getSwapById = async (swapId: string) => {
    try {
      const {
        data: { data },
      } = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/${swapId}?version=${process.env.NEXT_PUBLIC_API_VERSION}`
      )
      // set time to expire
      setTimeToExpire(new Date(data.created_date).getTime() + 72 * 3600 * 1000)
      // setTimeToExpire(new Date().getTime() + 30*1000) // now + 100
      const _sourceNetwork = sourceNetworks.find(
        (_n: Network) => _n.internal_name === data.source_network
      ) as Network
      const _sourceAsset = _sourceNetwork?.currencies?.find(
        (c: Token) => c.asset === data.source_asset
      )
      const _destinationNetwork = destinationNetworks.find(
        (_n: Network) => _n.internal_name === data.destination_network
      ) as Network
      const _destinationAsset = _destinationNetwork?.currencies?.find(
        (c: Token) => c.asset === data.destination_asset
      )

      setSourceNetwork(_sourceNetwork)
      setSourceAsset(_sourceAsset)
      setDestinationNetwork(_destinationNetwork)
      setDestinationAsset(_destinationAsset)
      setSourceAmount(data.requested_amount)
      setSwapStatus(data.status)
      setSwapId(data.id)
      setDepositAddress(data?.deposit_address?.split('###')?.[1])
      setDepositActions(data.deposit_actions)
      setDestinationAddress(data.destination_address)

      const userTransferTransaction = data?.transactions?.find(
        (t: any) => t.status === 'user_transfer'
      )?.transaction_hash
      setUserTransferTransaction(userTransferTransaction ?? '')
      const payoutTransaction = data?.transactions?.find(
        (t: any) => t.status === 'payout'
      )?.transaction_hash
      setBridgeMintTransactionHash(payoutTransaction ?? '')

      console.log('::swap data fetched')
    } catch (err) {
      console.log(err)
    }
  }

  React.useEffect(() => {
    swapId && getSwapById(swapId)
  }, [swapId])

  const [showConnectNetworkModal, setShowConnectNetworkModal] =
    React.useState<boolean>(false)
  const [networkToConnect] = React.useState<NetworkToConnect>()

  return (
    <>
      <Modal
        height="fit"
        show={showConnectNetworkModal}
        setShow={setShowConnectNetworkModal}
        header={`Network connect`}
      >
        <ConnectNetwork
          NetworkDisplayName={networkToConnect?.DisplayName as string}
          AppURL={networkToConnect?.AppURL as string}
        />
      </Modal>

      <Widget className={`md:min-w-[480px] max-w-lg ${className}`}>
        <Widget.Content>
          <ResizablePanel>
            {sourceNetwork &&
            sourceAsset &&
            sourceAmount &&
            destinationNetwork &&
            destinationAsset &&
            destinationAddress ? (
              <div className="min-h-[400px] w-full justify-center items-center flex">
                <SwapDetails
                  sourceNetwork={sourceNetwork}
                  sourceAsset={sourceAsset}
                  destinationNetwork={destinationNetwork}
                  destinationAsset={destinationAsset}
                  destinationAddress={destinationAddress}
                  sourceAmount={sourceAmount}
                  getSwapById={getSwapById}
                />
              </div>
            ) : (
              <div className="min-h-[400px] w-full justify-center items-center flex">
                <div className="animate-pulse w-full flex space-x-4">
                  <div className="flex-1 space-y-6 py-1">
                    <div className="h-32 bg-level-3 rounded-lg"></div>
                    <div className="h-40 bg-level-3 rounded-lg"></div>
                    <div className="h-12 bg-level-3 rounded-lg"></div>
                  </div>
                </div>
              </div>
            )}
          </ResizablePanel>
        </Widget.Content>
      </Widget>
    </>
  )
}

export default Form
