'use client'
import React from 'react'
import Modal from '../../modal/modal'
import ResizablePanel from '../../ResizablePanel'
import axios from 'axios'
import SwapDetails from './swap/SwapDetails'
import ConnectNetwork from '@/components/ConnectNetwork'
import mainNetworks from '@/components/lux/fireblocks/constants/networks.mainnets'
import devNetworks from '@/components/lux/fireblocks/constants/networks.sandbox'
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
} from '@/store/fireblocks'
import { useAtom } from 'jotai'
import type { Network, Token } from '@/types/fireblocks'

type NetworkToConnect = {
  DisplayName: string
  AppURL: string
}

interface IProps {
  swapId?: string
}

const Form: React.FC<IProps> = ({ swapId }) => {
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
  const [, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setEthPrice] = useAtom(ethPriceAtom)
  const [, setSwapId] = useAtom(swapIdAtom)
  const [, setUserTransferTransaction] = useAtom(userTransferTransactionAtom)
  const [, setBridgeMintTransactionHash] = useAtom(bridgeMintTransactionAtom)
  const [, setMpcSignature] = useAtom(mpcSignatureAtom)
  const [, setTimeToExpire] = useAtom(timeToExpireAtom)

  React.useEffect(() => {
    if (sourceAsset) {
      axios.get(`/api/tokens/price/${sourceAsset.asset}`).then((data) => {
        setEthPrice(Number(data?.data?.data?.price))
      })
    }
  }, [sourceAsset])

  const getSwapById = async (swapId: string) => {
    try {
      const {
        data: { data },
      } = await axios.get(
        `/api/swaps/${swapId}?version=${process.env.NEXT_PUBLIC_API_VERSION}`
      )
      // set time to expire
      console.log('::swap data for fireblocks: ', data)
      setTimeToExpire(new Date(data.created_date).getTime())
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

      console.log('::swap data:', data)

      setSourceNetwork(_sourceNetwork)
      setSourceAsset(_sourceAsset)
      setDestinationNetwork(_destinationNetwork)
      setDestinationAsset(_destinationAsset)
      setSourceAmount(data.requested_amount)
      setSwapStatus(data.status)
      setSwapId(data.id)
      setDestinationAddress(data.destination_address)

      const userTransferTransaction = data?.transactions?.find(
        (t: any) => t.status === 'user_transfer'
      )?.transaction_hash
      setUserTransferTransaction(userTransferTransaction ?? '')
      const mpcSignTransaction = data?.transactions?.find(
        (t: any) => t.status === 'mpc_sign'
      )?.transaction_hash
      setMpcSignature(mpcSignTransaction ?? '')
      const payoutTransaction = data?.transactions?.find(
        (t: any) => t.status === 'payout'
      )?.transaction_hash
      setBridgeMintTransactionHash(payoutTransaction ?? '')
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

      <Widget className="sm:min-h-[504px] max-w-lg">
        <Widget.Content>
          <ResizablePanel>
            {sourceNetwork &&
            sourceAsset &&
            sourceAmount &&
            destinationNetwork &&
            destinationAsset &&
            destinationAddress ? (
              <div className="min-h-[450px] justify-center items-center flex">
                <SwapDetails
                  sourceNetwork={sourceNetwork}
                  sourceAsset={sourceAsset}
                  destinationNetwork={destinationNetwork}
                  destinationAsset={destinationAsset}
                  destinationAddress={destinationAddress}
                  sourceAmount={sourceAmount}
                />
              </div>
            ) : (
              <div className="w-full h-[430px]">
                <div className="animate-pulse flex space-x-4">
                  <div className="flex-1 space-y-6 py-1">
                    <div className="h-32 bg-level-1 rounded-lg"></div>
                    <div className="h-40 bg-level-1 rounded-lg"></div>
                    <div className="h-12 bg-level-1 rounded-lg"></div>
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
