'use client'
import React, { type FC } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import axios from 'axios'

import { ArrowLeftRight, ArrowUpDown, WalletIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/modal/modal'
import ResizablePanel from '@/components/ResizablePanel'
import shortenAddress from '../../../utils/ShortenAddress'
import Widget from '../../../Widget'

import FromNetworkForm from './from/NetworkFormField'
import ToNetworkForm from './to/NetworkFormField'
import SwapDetails from './SwapDetails'
import { SWAP_PAIRS } from '@/components/lux/teleport/constants/settings'
//hooks
import useWallet from '@/hooks/useWallet'
import useAsyncEffect from 'use-async-effect'
import { useAtom } from 'jotai'
import { useEthersSigner } from '@/hooks/useEthersSigner'

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
import { fetchTokenBalance } from '@/lib/utils'
import { Button } from '@hanzo/ui/primitives'
import { useSettings } from '@/context/settings'
import { useServerAPI } from '@/hooks/useServerAPI'
import {
  NetworkType,
  type CryptoNetwork,
  type NetworkCurrency,
} from '@/Models/CryptoNetwork'

const Address = dynamic(
  () => import('@/components/lux/teleport/share/Address'),
  {
    loading: () => <></>,
  }
)

const Swap: FC = () => {
  const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === 'mainnet'

  const { networks } = useSettings()

  const filteredNetworks = networks.filter(
    (n: CryptoNetwork) =>
      n.type === NetworkType.EVM &&
      n.is_testnet === !isMainnet &&
      n.status === 'active'
  )

  // const networks = isMainnet ? mainNetworks : devNetworks

  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false)
  const [showAddressModal, setShowAddressModal] = React.useState<boolean>(false)
  const [sourceNetwork, setSourceNetwork] = useAtom(sourceNetworkAtom)
  const [sourceAsset, setSourceAsset] = useAtom(sourceAssetAtom)
  //balances
  const [sourceBalance, setSourceBalance] = React.useState<number>(0)
  const [isSourceBalanceLoading, setIsSourceBalanceLoading] =
    React.useState<boolean>(false)
  const [destinationBalance, setDestinationBalance] = React.useState<number>(0)
  const [isDestinationBalanceLoading, setIsDestinationBalanceLoading] =
    React.useState<boolean>(false)

  const [destinationNetwork, setDestinationNetwork] = useAtom(
    destinationNetworkAtom
  )
  const [destinationAsset, setDestinationAsset] = useAtom(destinationAssetAtom)
  const [destinationAddress, setDestinationAddress] = useAtom(
    destinationAddressAtom
  )

  const [sourceAmount] = useAtom(sourceAmountAtom)
  const [swapId, setSwapId] = useAtom(swapIdAtom)
  const [, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setEthPrice] = useAtom(ethPriceAtom)

  //hooks
  const { serverAPI } = useServerAPI()
  const router = useRouter()
  const { address, isConnecting } = useEthersSigner()
  const { connectWallet } = useWallet()

  const sourceNetworks = filteredNetworks
  const [destinationNetworks, setDestinationNetworks] = React.useState<
    CryptoNetwork[]
  >([])

  React.useEffect(() => {
    setSourceNetwork(filteredNetworks.find((n) => n.status === 'active'))
  }, [])

  React.useEffect(() => {
    sourceNetwork &&
      sourceNetwork.currencies.length > 0 &&
      setSourceAsset(
        sourceNetwork.currencies.find((c) => c.status === 'active')
      )
  }, [sourceNetwork])

  React.useEffect(() => {
    if (!sourceAsset) return
    const _networks = filteredNetworks
      .filter(
        (n: CryptoNetwork) =>
          n.currencies.some((c: NetworkCurrency) =>
            SWAP_PAIRS[sourceAsset.asset]
              ? SWAP_PAIRS[sourceAsset.asset].includes(c.asset)
              : false
          ) && n.is_testnet === sourceNetwork?.is_testnet
      )
      .map((n: CryptoNetwork) => ({
        ...n,
        currencies: n.currencies.map((c: NetworkCurrency) => ({
          ...c,
          status: SWAP_PAIRS?.[sourceAsset.asset].includes(c.asset)
            ? c.status
            : 'inactive',
        })),
      }))

    setDestinationNetworks(_networks)
    setDestinationNetwork(_networks.find((n) => n.status === 'active'))
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
    if (!address) {
      return 'Connect Wallet First'
    } else if (!sourceNetwork) {
      return 'Select Source Network'
    } else if (!sourceAsset) {
      return 'Select Source Asset'
    } else if (!destinationNetwork) {
      return 'Select Destination Network'
    } else if (!destinationAsset) {
      return 'Select Destination Asset'
    } else if (sourceAmount === '') {
      return 'Enter Token Amount'
    } else if (Number(sourceAmount) <= 0) {
      return 'Invalid Token Amount'
    } else if (Number(sourceAmount) > Number(sourceBalance)) {
      return 'Insufficient Token Amount'
    } else if (!destinationAddress) {
      return 'Input Destination Address'
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
    sourceBalance,
    address,
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
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps?version=${process.env.NEXT_PUBLIC_API_VERSION}`,
        data
      )
      // setSwapId(response.data?.data?.swap_id)
      window.history.pushState(
        {},
        '',
        `/swap/teleporter/${response.data?.data?.swap_id}`
      )
      setSwapStatus(SwapStatus.UserTransferPending)
      // setShowSwapModal(true)
      router.push(`/swap/teleporter/${response.data?.data?.swap_id}`)
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
  useAsyncEffect(async () => {
    if (address && sourceNetwork && sourceAsset) {
      setIsSourceBalanceLoading(true)
      const _balance = await fetchTokenBalance(
        address,
        sourceNetwork,
        sourceAsset
      )
      setSourceBalance(_balance)
      setIsSourceBalanceLoading(false)
    } else {
      setSourceBalance(0)
    }
  }, [address, sourceNetwork, sourceAsset])
  // set destination balance
  useAsyncEffect(async () => {
    if (address && destinationNetwork && destinationAsset) {
      setIsDestinationBalanceLoading(true)
      const _balance = await fetchTokenBalance(
        address,
        destinationNetwork,
        destinationAsset
      )
      setDestinationBalance(_balance)
      setIsDestinationBalanceLoading(false)
    } else {
      setDestinationBalance(0)
    }
  }, [address, destinationNetwork, destinationAsset])

  const handleExchange = () => {
    if (destinationAsset || destinationNetwork) {
      setSourceNetwork(destinationNetwork)
      setSourceAsset(destinationAsset)
    }
  }

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
            setNetwork={(network: CryptoNetwork) => {
              setSourceNetwork(network)
            }}
            maxValue={sourceBalance.toString()}
            setAsset={(token: NetworkCurrency) => setSourceAsset(token)}
            networks={sourceNetworks}
            balance={sourceBalance}
            balanceLoading={isSourceBalanceLoading}
          />
          <div className='flex justify-center items-center -my-7 z-10'>
            <ArrowUpDown onClick={() => handleExchange()} height={40} width={36} className='p-2 bg-level-1 rounded-md border-2 border-black hover:bg-level-3 cursor-pointer'/>
          </div>
          <ToNetworkForm
            disabled={!sourceNetwork}
            network={destinationNetwork}
            asset={destinationAsset}
            sourceAsset={sourceAsset}
            setNetwork={(network: CryptoNetwork) =>
              setDestinationNetwork(network)
            }
            setAsset={(token: NetworkCurrency) => setDestinationAsset(token)}
            networks={destinationNetworks}
            balance={destinationBalance}
            balanceLoading={isDestinationBalanceLoading}
          />
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
        {!address ? (
          <Button
            onClick={() => connectWallet('evm')}
            variant="primary"
            className={
              'flex gap-2 justify-between xs:w-full md:w-auto' /* "border -mb-3 border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated" */
            }
          >
            {isConnecting ? (
              <SpinIcon className="animate-spin h-5 w-5" />
            ) : (
              <WalletIcon className="h-5 w-5" />
            )}
            <span className="grow">Connect Wallet</span>
          </Button>
        ) : (
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
              isSubmitting ||
              !address
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
        )}

        {/* <Modal
          height="fit"
          show={showSwapModal}
          setShow={setShowSwapModal}
          header="Complete the swap"
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
                swapId={swapId}
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
        </Modal> */}
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
