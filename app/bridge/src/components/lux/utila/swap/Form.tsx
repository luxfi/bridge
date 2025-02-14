'use client'
import React, { type FC } from 'react'
import dynamic from 'next/dynamic'
import axios from 'axios'
//comps
import Modal from '@/components/modal/modal'
import Image from 'next/image'
import Widget from '@/components/Widget/index'
import SpinIcon from '@/components/icons/spinIcon'
import shortenAddress from '@/components/utils/ShortenAddress'
import FromNetworkForm from '@/components/lux/teleport/swap/from/NetworkFormField'
import ToNetworkForm from '@/components/lux/teleport/swap/to/NetworkFormField'
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react'
//hooks
import useWallet from '@/hooks/useWallet'
import useAsyncEffect from 'use-async-effect'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/context/settings'
import { useServerAPI } from '@/hooks/useServerAPI'
import { useEthersSigner } from '@/hooks/useEthersSigner'
//types
import { NetworkType, type CryptoNetwork, type NetworkCurrency } from '@/Models/CryptoNetwork'
//utils
import { fetchTokenBalance } from '@/lib/utils'
import { getDestinationNetworks, getFirstSourceNetwork } from '@/util/swapsHelper'
import { useNotify } from '@/context/toast-provider'

const Address = dynamic(() => import('@/components/lux/teleport/share/Address'), {
  loading: () => <></>,
})

const Swap: FC = () => {
  const { notify } = useNotify()

  const { networks } = useSettings()
  const filteredNetworks = networks.filter((n: CryptoNetwork) => n.status === 'active' && n.type !== NetworkType.EVM)

  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false)
  const [showAddressModal, setShowAddressModal] = React.useState<boolean>(false)
  const [sourceNetwork, setSourceNetwork] = React.useState<CryptoNetwork | undefined>(undefined)
  const [sourceAsset, setSourceAsset] = React.useState<NetworkCurrency | undefined>(undefined)
  //balances
  const [sourceBalance, setSourceBalance] = React.useState<number>(0)
  const [isSourceBalanceLoading, setIsSourceBalanceLoading] = React.useState<boolean>(false)
  const [destinationBalance, setDestinationBalance] = React.useState<number>(0)
  const [isDestinationBalanceLoading, setIsDestinationBalanceLoading] = React.useState<boolean>(false)

  const [destinationNetwork, setDestinationNetwork] = React.useState<CryptoNetwork | undefined>(undefined)
  const [destinationAsset, setDestinationAsset] = React.useState<NetworkCurrency | undefined>(undefined)
  const [destinationAddress, setDestinationAddress] = React.useState<string>('')

  const [sourceAmount, setSourceAmount] = React.useState<string>('')
  const [tokenPrice, setTokenPrice] = React.useState<number>(0)

  // hooks
  const router = useRouter()
  const { serverAPI } = useServerAPI()
  const { connectWallet } = useWallet()
  const { address, isConnecting } = useEthersSigner()

  // src & dst networks
  const sourceNetworks = filteredNetworks
  const destinationNetworks = React.useMemo(() => getDestinationNetworks(sourceNetwork, sourceAsset, networks), [sourceAsset, sourceNetwork])
  // if page is mounted, set sourceNetwork as first one
  React.useEffect(() => {
    setSourceNetwork(filteredNetworks[0])
  }, [])
  // when sourceNetwork is changed, set source asset as first asset
  React.useEffect(() => {
    if (sourceNetwork) {
      setSourceAsset(sourceNetwork.currencies.find((c) => c.status === 'active'))
    } else {
      setSourceNetwork(filteredNetworks[0])
    }
  }, [sourceNetwork])
  // set destination network
  React.useEffect(() => {
    setDestinationNetwork(destinationNetworks[0])
  }, [destinationNetworks])
  // when detination Network is changed, set destination asset as first asset
  React.useEffect(() => {
    // Prevent triggering useEffect if flip is in progress
    // if (flipInProgress) return

    setDestinationAsset(destinationNetwork?.currencies.find((c) => c.status === 'active'))
  }, [destinationNetwork])

  const handleFlip = () => {
  }

  // get token price
  React.useEffect(() => {
    if (sourceAsset) {
      serverAPI.get(`/api/tokens/price/${sourceAsset.asset}`).then((data) => {
        setTokenPrice(Number(data?.data?.data?.price))
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
    } else if (sourceAmount === '') {
      return 'Enter Token Amount'
    } else if (Number(sourceAmount) <= 0) {
      return 'Invalid Token Amount'
    // } else if (Number(sourceAmount) > Number(sourceBalance)) {
    //   return 'Insufficient Token Amount'
    } else if (!destinationAddress) {
      return 'Input Destination Address'
    } else {
      return 'Create Swap'
    }
  }, [sourceNetwork, sourceAsset, destinationNetwork, destinationAsset, destinationAddress, sourceAmount, sourceBalance, address])

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
      console.log('::data for swap:', data)
      const response = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps?version=${process.env.NEXT_PUBLIC_API_VERSION}`, data)
      console.log('::swap creation response:', response.data.data)
      router.push(`/swap/v2/${response.data?.data?.swap_id}`)
    } catch (err) {
      notify(String(err), 'warn')
      console.log(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSwap = () => {
    if (sourceNetwork && sourceAsset && destinationNetwork && destinationNetwork && destinationAddress && Number(sourceAmount) > 0) {
      createSwap()
      setIsSubmitting(true)
    }
  }
  // set source balance
  // useAsyncEffect(async () => {
  //   if (address && sourceNetwork && sourceAsset) {
  //     setIsSourceBalanceLoading(true)
  //     const _balance = await fetchTokenBalance(address, sourceNetwork, sourceAsset)
  //     setSourceBalance(_balance)
  //     setIsSourceBalanceLoading(false)
  //   } else {
  //     setSourceBalance(0)
  //   }
  // }, [address, sourceNetwork, sourceAsset])
  // set destination balance
  useAsyncEffect(async () => {
    if (address && destinationNetwork && destinationAsset) {
      setIsDestinationBalanceLoading(true)
      const _balance = await fetchTokenBalance(address, destinationNetwork, destinationAsset)
      setDestinationBalance(_balance)
      setIsDestinationBalanceLoading(false)
    } else {
      setDestinationBalance(0)
    }
  }, [address, destinationNetwork, destinationAsset])

  return (
    <Widget className="sm:min-h-[504px] max-w-lg mt-20 md:mt-0">
      <Widget.Content>
        <div id="WIDGET_CONTENT" className="flex-col relative flex justify-between w-full mb-3.5 leading-4 overflow-hidden">
          <FromNetworkForm
            amount={sourceAmount}
            setAmount={setSourceAmount}
            disabled={false}
            network={sourceNetwork}
            setNetwork={(network: CryptoNetwork) => {
              setSourceNetwork(network)
            }}
            asset={sourceAsset}
            setAsset={(token: NetworkCurrency) => setSourceAsset(token)}
            maxValue={sourceBalance.toString()}
            networks={sourceNetworks}
            balance={sourceBalance}
            balanceLoading={isSourceBalanceLoading}
          />
          <div className="flex justify-center items-center -my-7 z-10">
            <ArrowUpDown
              onClick={() => handleFlip()}
              height={40}
              width={36}
              className="p-2 bg-level-1 rounded-md border-2 border-black hover:bg-level-3 cursor-pointer"
            />
          </div>
          <ToNetworkForm
            disabled={!sourceNetwork}
            amount={sourceAmount}
            network={destinationNetwork}
            asset={destinationAsset}
            sourceAsset={sourceAsset}
            setNetwork={(network: CryptoNetwork) => setDestinationNetwork(network)}
            setAsset={(token: NetworkCurrency) => setDestinationAsset(token)}
            networks={destinationNetworks}
            balance={destinationBalance}
            balanceLoading={isDestinationBalanceLoading}
          />
        </div>

        <div className="w-full xs:mb-3 leading-4">
          <label htmlFor="destination_address" className="block font-semibold text-xs">
            {`To ${destinationNetwork?.display_name ?? ''} address`}
          </label>
          <AddressButton
            disabled={!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset}
            placeholder={destinationNetwork ? 'Enter your address here' : 'Select destination network'}
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
              disabled={!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset}
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
            warningMessage === 'Create Swap' && <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
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
  placeholder: string
  disabled: boolean
  address: string
}> = ({ openAddressModal, isPartnerWallet, partnerImage, disabled, placeholder, address }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={openAddressModal}
    className="flex rounded-lg space-x-3 items-center cursor-pointer shadow-sm mt-1.5 bg-level-1 border-black border disabled:cursor-not-allowed h-12 leading-4 focus:ring-muted focus:border-muted font-semibold w-full px-3.5 py-3"
  >
    {isPartnerWallet && (
      <div className="shrink-0 flex items-center pointer-events-none">
        {partnerImage && <Image alt="Partner logo" className="rounded-md object-contain" src={partnerImage} width="24" height="24" />}
      </div>
    )}
    <div className="truncate text-muted">{address ? <TruncatedAdrress address={address} /> : <span>{placeholder}</span>}</div>
  </button>
)

export default Swap
