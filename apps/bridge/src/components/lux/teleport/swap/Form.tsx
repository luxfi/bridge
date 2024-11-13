'use client'
import React, { type FC } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import axios from 'axios'

import { ArrowLeftRight } from 'lucide-react'

import Modal from '@/components/modal/modal'
import ResizablePanel from '@/components/ResizablePanel'
import shortenAddress from '../../../utils/ShortenAddress'
import Widget from '../../../Widget'

import FromNetworkForm from './from/NetworkFormField'
import ToNetworkForm from './to/NetworkFormField'
import SwapDetails from './SwapDetails'
import type { Token, Network } from '@/types/teleport'
import { SWAP_PAIRS } from '@/components/lux/teleport/constants/settings'
import { useAtom } from 'jotai'

import { networks as devNetworks } from '@/components/lux/teleport/constants/networks.sandbox'
import { networks as mainNetworks } from '@/components/lux/teleport/constants/networks.mainnets'

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
} from '@/store/teleport'
import SpinIcon from '@/components/icons/spinIcon'
import { SwapStatus } from '@/Models/SwapStatus'

const Address = dynamic(
  () => import('@/components/lux/teleport/share/Address'),
  {
    loading: () => <></>,
  }
)

const Swap: FC = () => {
  const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === 'mainnet'
  const networks = isMainnet ? mainNetworks : devNetworks

  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false)
  const [showAddressModal, setShowAddressModal] = React.useState<boolean>(false)
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
  const [swapId, setSwapId] = useAtom(swapIdAtom)
  const [, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setEthPrice] = useAtom(ethPriceAtom)

  const sourceNetworks = networks
  const [destinationNetworks, setDestinationNetworks] = React.useState<
    Network[]
  >([])

  React.useEffect(() => {
    setSourceNetwork(networks.find((n) => n.status === 'active'))
  }, [])

  React.useEffect(() => {
    sourceNetwork &&
      sourceNetwork.currencies.length > 0 &&
      setSourceAsset(
        sourceNetwork.currencies.find((c) => c.status === 'active')
      )
  }, [sourceNetwork])

  React.useEffect(() => {
    if (sourceAsset) {
      const _networks = networks
        .filter(
          (n: Network) =>
            n.currencies.some((c: Token) =>
              SWAP_PAIRS[sourceAsset.asset]
                ? SWAP_PAIRS[sourceAsset.asset].includes(c.asset)
                : false
            ) && n.is_testnet === sourceNetwork?.is_testnet
        )
        .map((n: Network) => ({
          ...n,
          currencies: n.currencies.map((c: Token) => ({
            ...c,
            status: SWAP_PAIRS?.[sourceAsset.asset].includes(c.asset)
              ? c.status
              : 'inactive',
          })),
        }))

      setDestinationNetworks(_networks)
      setDestinationNetwork(_networks.find((n) => n.status === 'active'))
    }
  }, [sourceAsset, sourceNetwork])

  React.useEffect(() => {
    setDestinationAsset(
      destinationNetwork?.currencies.find((c) => c.status === 'active')
    )
  }, [destinationNetwork])

  const [showSwapModal, setShowSwapModal] = React.useState<boolean>(false)

  React.useEffect(() => {
    if (sourceAsset) {
      axios.get(`/api/tokens/price/${sourceAsset.asset}`).then((data) => {
        setEthPrice(Number(data?.data?.data?.price))
      })
    }
  }, [sourceAsset])

  const warnningMessage = React.useMemo(() => {
    if (!sourceNetwork) {
      return 'Select Source Network'
    } else if (!sourceAsset) {
      return 'Select Source Asset'
    } else if (!destinationNetwork) {
      return 'Select Destination Network'
    } else if (!destinationAsset) {
      return 'Select Destination Asset'
    } else if (!destinationAddress) {
      return 'Input Address'
    } else if (sourceAmount === '') {
      return 'Enter Token Amount'
    } else if (Number(sourceAmount) <= 0) {
      return 'Invalid Token Amount'
    } else {
      return 'Swap Now'
    }
  }, [
    sourceNetwork,
    sourceAsset,
    destinationNetwork,
    destinationAsset,
    destinationAddress,
    sourceAmount,
  ])

  const createSwap = async () => {
    try {
      const data = {
        amount: Number(sourceAmount),
        source_network: sourceNetwork?.internal_name,
        source_asset: sourceAsset?.asset,
        source_address: '',
        destination_network: destinationNetwork?.internal_name,
        destination_asset: destinationAsset?.asset,
        destination_address: destinationAddress,
        refuel: false,
        use_deposit_address: false,
        use_teleporter: true,
        app_name: 'Bridge',
      }
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps?version=mainnet`,
        data
      )
      setSwapId(response.data?.data?.swap_id)
      window.history.pushState(
        {},
        '',
        `/swap/teleporter/${response.data?.data?.swap_id}`
      )
      setSwapStatus(SwapStatus.UserTransferPending)
      setShowSwapModal(true)
      // router.push(`/swap/teleporter/${response.data?.data?.swap_id}`);
    } catch (err) {
      console.log(err)
      setIsSubmitting(false)
    }
  }

  const handleSwap = () => {
    if (
      sourceNetwork &&
      sourceAsset &&
      destinationNetwork &&
      destinationNetwork &&
      destinationAddress &&
      Number(sourceAmount) > 0
    ) {
      createSwap()
      setIsSubmitting(true)
    }
  }

  return (
    <Widget className="sm:min-h-[504px] max-w-lg">
      <Widget.Content>
        <div className="flex-col relative flex justify-between w-full space-y-0.5 mb-3.5 leading-4 border border-[#404040] rounded-t-xl overflow-hidden">
          <div className="flex flex-col w-full">
            <FromNetworkForm
              disabled={false}
              network={sourceNetwork}
              asset={sourceAsset}
              setNetwork={(network: Network) => {
                setSourceNetwork(network)
              }}
              setAsset={(token: Token) => setSourceAsset(token)}
              networks={sourceNetworks}
            />
          </div>
          {/* <div className="py-4 px-4">
            Fee: {1}
            <span className="text-xs"> %</span>
          </div> */}

          <div className="flex flex-col w-full">
            <ToNetworkForm
              disabled={!sourceNetwork}
              network={destinationNetwork}
              asset={destinationAsset}
              sourceAsset={sourceAsset}
              setNetwork={(network: Network) => setDestinationNetwork(network)}
              setAsset={(token: Token) => setDestinationAsset(token)}
              networks={destinationNetworks}
            />
          </div>
        </div>

        <div className="w-full !-mb-3 leading-4">
          <label
            htmlFor="destination_address"
            className="block font-semibold text-xs"
          >
            {`To ${destinationNetwork?.display_name ?? ''} address`}
          </label>
          <AddressButton
            disabled={
              !sourceNetwork ||
              !sourceAsset ||
              !destinationNetwork ||
              !destinationAsset
            }
            isPartnerWallet={false}
            openAddressModal={() => setShowAddressModal(true)}
            partnerImage={'partnerImage'}
            address={destinationAddress}
          />
          <Modal
            header={`To ${destinationNetwork?.display_name ?? ''} address`}
            height="fit"
            show={showAddressModal}
            setShow={setShowAddressModal}
            className="min-h-[70%]"
          >
            <Address
              close={() => setShowAddressModal(false)}
              disabled={
                !sourceNetwork ||
                !sourceAsset ||
                !destinationNetwork ||
                !destinationAsset
              }
              address={destinationAddress}
              setAddress={setDestinationAddress}
              name={'destination_address'}
              partnerImage={'partnerImage'}
              isPartnerWallet={false}
              address_book={[]}
              network={destinationNetwork}
            />
          </Modal>
        </div>

        <button
          onClick={handleSwap}
          disabled={
            !sourceNetwork ||
            !sourceAsset ||
            !destinationNetwork ||
            !destinationAsset ||
            !destinationAddress ||
            !sourceAmount ||
            Number(sourceAmount) <= 0 ||
            isSubmitting
          }
          className="border -mb-3 border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
        >
          {isSubmitting ? (
            <SpinIcon className="animate-spin h-5 w-5" />
          ) : (
            warnningMessage === 'Swap Now' && (
              <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
            )
          )}
          <span className="grow">{warnningMessage}</span>
        </button>

        <Modal
          height="fit"
          show={showSwapModal}
          setShow={setShowSwapModal}
          header={`Complete the swap`}
          onClose={() => setShowSwapModal(false)}
        >
          <ResizablePanel>
            {sourceNetwork &&
            sourceAsset &&
            sourceAmount &&
            destinationNetwork &&
            destinationAsset &&
            destinationAddress ? (
              <SwapDetails
                className="min-h-[450px] justify-center max-w-lg"
                sourceNetwork={sourceNetwork}
                sourceAsset={sourceAsset}
                destinationNetwork={destinationNetwork}
                destinationAsset={destinationAsset}
                destinationAddress={destinationAddress}
                sourceAmount={sourceAmount}
              />
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
        </Modal>
      </Widget.Content>
    </Widget>
  )
}

const TruncatedAdrress = ({ address }: { address: string }) => {
  const shortAddress = shortenAddress(address)
  return <div className="tracking-wider ">{shortAddress}</div>
}

const AddressButton: FC<{
  openAddressModal: () => void
  isPartnerWallet: boolean
  partnerImage?: string
  disabled: boolean
  address: string
}> = ({
  openAddressModal,
  isPartnerWallet,
  partnerImage,
  disabled,
  address,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={openAddressModal}
    className="flex rounded-lg space-x-3 items-center cursor-pointer shadow-sm mt-1.5 bg-level-1 border-[#404040] border disabled:cursor-not-allowed h-12 leading-4 focus:ring-muted focus:border-muted font-semibold w-full px-3.5 py-3"
  >
    {isPartnerWallet && (
      <div className="shrink-0 flex items-center pointer-events-none">
        {partnerImage && (
          <Image
            alt="Partner logo"
            className="rounded-md object-contain"
            src={partnerImage}
            width="24"
            height="24"
          />
        )}
      </div>
    )}
    <div className="truncate text-muted">
      {address ? (
        <TruncatedAdrress address={address} />
      ) : (
        <span>Enter your address here</span>
      )}
    </div>
  </button>
)

export default Swap
