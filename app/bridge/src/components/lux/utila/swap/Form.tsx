'use client'
import React, { type FC }from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import axios from 'axios'
//hooks
import { useRouter } from 'next/navigation'
import { useAtom } from 'jotai'

import { ArrowLeftRight } from 'lucide-react'

import Modal from '@/components/modal/modal'
import shortenAddress from '@/components/utils/ShortenAddress'
import Widget from '@/components/Widget/index'

import FromNetworkForm from './from/NetworkFormField'
import ToNetworkForm from './to/NetworkFormField'
import type { Token, Network } from '@/types/utila'
import { SWAP_PAIRS } from '@/components/lux/utila/constants/settings'
import { useEthersSigner } from "@/hooks/useEthersSigner";
import { fetchTokenBalance } from '@/lib/utils'

import devNetworks from '@/components/lux/utila/constants/networks.sandbox'
import mainNetworks from '@/components/lux/utila/constants/networks.mainnets'

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
  timeToExpireAtom,
} from '@/store/utila'
import SpinIcon from '@/components/icons/spinIcon'
import { useNotify } from '@/context/toast-provider'
import { useServerAPI } from '@/hooks/useServerAPI'

const Address = dynamic(
  () => import('@/components/lux/utila/share/Address'),
  {
    loading: () => <></>,
  }
)

const Swap: FC = () => {
  const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === 'mainnet'
  const { sourceNetworks, destinationNetworks: dstNetworks } = isMainnet
    ? mainNetworks
    : devNetworks

  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false)
  const [showAddressModal, setShowAddressModal] = React.useState<boolean>(false)
  const [sourceNetwork, setSourceNetwork] = useAtom(sourceNetworkAtom)
  const [sourceAsset, setSourceAsset] = useAtom(sourceAssetAtom)

  const [sourceBalance, setSourceBalance] = React.useState<number>(0)
  const [isSourceBalanceLoading, setIsSourceBalanceLoading] = React.useState<boolean>(false);
  const [destinationBalance, setDestinationBalance] = React.useState<number>(0);
  const [isDestinationBalanceLoading, setIsDestinationBalanceLoading] = React.useState<boolean>(false);

  const [destinationNetwork, setDestinationNetwork] = useAtom(
    destinationNetworkAtom
  )
  const [destinationAsset, setDestinationAsset] = useAtom(destinationAssetAtom)
  const [destinationAddress, setDestinationAddress] = useAtom(
    destinationAddressAtom
  )
  const [sourceAmount, setSourceAmount] = useAtom(sourceAmountAtom)
  const [, setSwapId] = useAtom(swapIdAtom)
  const [, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setEthPrice] = useAtom(ethPriceAtom)
  const [, setTimeToExpire] = useAtom(timeToExpireAtom)

  const [destinationNetworks, setDestinationNetworks] =
    React.useState<Network[]>(dstNetworks)

  const router = useRouter ()
  const { notify } = useNotify ()
  const { serverAPI } = useServerAPI ()


  React.useEffect(() => {
    sourceNetwork &&
      sourceNetwork.currencies.length > 0 &&
      setSourceAsset(
        sourceNetwork.currencies.find((c) => c.status === 'active')
      )
  }, [sourceNetwork])

  React.useEffect(() => {
    setSourceNetwork(sourceNetworks.find((n) => n.status === 'active'))
  }, [])

  React.useEffect(() => {
    if (sourceAsset) {
      const _networks = dstNetworks.map((n: Network) => ({
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
      serverAPI.get(`/api/tokens/price/${sourceAsset.asset}`).then((data) => {
        setEthPrice(Number(data?.data?.data?.price))
      })
    }
  }, [sourceAsset])

  const warningMessage = React.useMemo(() => {
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
    } else {
      return 'Create Swap'
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
        use_deposit_address: true,
        use_teleporter: false,
        app_name: 'Bridge',
      }

      const response = await serverAPI.post(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps?version=${process.env.NEXT_PUBLIC_API_VERSION}`,
        data
      )

      console.log('::utila res:', response.data)
      setSwapId(response.data?.data?.swap_id)
      setTimeToExpire(new Date(response.data?.data?.created_date).getTime())
      // window.history.pushState(
      //   {},
      //   '',
      //   `/swap/utila/${response.data?.data?.swap_id}`
      // )
      // setSwapStatus(SwapStatus.UserDepositPending)
      // setShowSwapModal(true)
      router.push(`/swap/v2/${response.data?.data?.swap_id}`)
    } catch (err) {
      console.log(err)
    } finally {
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

  // set source balance
  // useAsyncEffect(async () => {
  //   if (sourceNetwork && sourceAsset) {
  //     setIsSourceBalanceLoading (true);
  //     const _balance = await fetchTokenBalance(address, sourceNetwork, sourceAsset)
  //     setSourceBalance (_balance)
  //     setIsSourceBalanceLoading (false);
  //   } else {
  //     setSourceBalance (0)
  //   }
  // }, [sourceNetwork, sourceAsset])
  // useAsyncEffect(async () => {
  //   if (address && destinationNetwork && destinationAsset) {
  //     setIsDestinationBalanceLoading (true);
  //     const _balance = await fetchTokenBalance(address, destinationNetwork, destinationAsset)
  //     setDestinationBalance (_balance)
  //     setIsDestinationBalanceLoading (false);
  // } else {
  //   setDestinationBalance (0)
  // }
  // }, [address, destinationNetwork, destinationAsset])

  return (
    <Widget className="sm:min-h-[504px] max-w-lg mt-20 md:mt-0">
      <Widget.Content>
        <div
          id="WIDGET_CONTENT"
          className="flex-col relative flex justify-between w-full mb-3.5 leading-4 overflow-hidden"
        >
          <FromNetworkForm
            disabled={false}
            network={sourceNetwork}
            asset={sourceAsset}
            setNetwork={(network: Network) => {
              setSourceNetwork(network)
            }}
            maxValue={sourceBalance.toString()}
            setAsset={(token: Token) => setSourceAsset(token)}
            networks={sourceNetworks}
            balance={sourceBalance}
            balanceLoading={isSourceBalanceLoading}
          />
          {/* <div className="py-4">
            <span className="text-md">Fee: {1}</span>
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
              balance={destinationBalance}
              balanceLoading={isDestinationBalanceLoading}
            />
          </div>
        </div>

        <div className="w-full xs:mb-3 leading-4">
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
            warningMessage === 'Create Swap' && (
              <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
            )
          )}
          <span className="grow">{warningMessage}</span>
        </button>
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
