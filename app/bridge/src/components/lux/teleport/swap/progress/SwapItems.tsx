import React from 'react'
import Image from 'next/image'
import shortenAddress from '@/components/utils/ShortenAddress'
import { useAtom } from 'jotai'
import { truncateDecimals } from '@/components/utils/RoundDecimals'
import { useChainId } from 'wagmi'
import { useEthersSigner } from '@/lib/ethersToViem/ethers'
import { ethers } from 'ethers'
// import { erc20ABI } from "wagmi";
import { formatEther } from 'ethers/lib/utils'
import { WalletIcon } from 'lucide-react'
import { erc20ABI } from '@wagmi/core'
import useWallet from '@/hooks/useWallet'
import useAsyncEffect from 'use-async-effect'
// types
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'
import { useSettings } from '@/context/settings'
import { useServerAPI } from '@/hooks/useServerAPI'

interface IProps {
  sourceNetwork: CryptoNetwork
  sourceAsset: NetworkCurrency
  destinationNetwork: CryptoNetwork
  destinationAsset: NetworkCurrency
  destinationAddress: string
  sourceAmount: string
}

const SwapItems: React.FC<IProps> = ({ sourceNetwork, sourceAsset, destinationNetwork, destinationAddress, destinationAsset, sourceAmount }) => {
  const { networks } = useSettings()
  const { serverAPI } = useServerAPI()

  
  //token price
  const [tokenPrice, setTokenPrice] = React.useState<number>(0)

  const { connectWallet } = useWallet()

  const [sourceBalance, setSourceBalance] = React.useState<string>('0')
  const [destinationBalance, setDestinationBalance] = React.useState<string>('0')

  const [isFetching, setIsFetching] = React.useState<boolean>(true)

  const chainId = useChainId()
  const signer = useEthersSigner()

  const toMint = React.useMemo(
    () => (destinationAsset.name.startsWith('Liquid ') || destinationAsset.name.startsWith('Zoo ') ? true : false),
    [destinationAsset]
  )

  const _network = networks.find((n: CryptoNetwork) => Number(n.chain_id) === chainId)

  // get token price
  React.useEffect(() => {
    if (sourceAsset) {
      serverAPI.get(`/api/tokens/price/${sourceAsset.asset}`).then((data) => {
        setTokenPrice(Number(data?.data?.data?.price))
      })
    }
  }, [sourceAsset])

  const _renderWallet = () => {
    if (signer) {
      return (
        <div className="bg-level-1 font-normal p-3 rounded-lg flex flex-col gap-1 border border-[#404040] w-full">
          {_network ? (
            <div className="flex items-center gap-2">
              <Image src={_network.logo || ''} height={30} width={30} alt="logo" className="rounded-lg border border-[#404040]" />
              <span>{_network.display_name}</span>
            </div>
          ) : (
            'Unsupported Chain'
          )}
          <span className="break-all truncate text-sm">{signer._address}</span>
        </div>
      )
    } else {
      return (
        <div className="bg-level-1 font-normal p-3 rounded-lg flex justify-between items-center gap-1 border border-[#404040] w-full">
          <span>No Connected Wallet</span>
          {/* <span
            onClick={() => connectWallet('evm')}
            className="text-xs text-[#c9cca1] cursor-pointer hover:opacity-45"
          >
            CONNECT
          </span> */}
        </div>
      )
    }
  }

  const getNetworkBalance = async (network: CryptoNetwork, asset: NetworkCurrency) => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(network.nodes[0])
      const address = signer?._address

      if (!address) return '0'

      if (asset.asset === network.native_currency) {
        const ethBal = await provider.getBalance(signer?._address!)
        return formatEther(ethBal)
      } else {
        // Get ERC-20 token balance
        const tokenContract = new ethers.Contract(asset.contract_address!, erc20ABI, provider)
        const tokenBal = await tokenContract.balanceOf(address)
        const decimals = await tokenContract.decimals()
        return ethers.utils.formatUnits(tokenBal, decimals)
      }
    } catch (err) {
      console.log(err)
      return '0'
    }
  }

  useAsyncEffect(async () => {
    try {
      setIsFetching(true)
      const [_sourceBalance, _destinationBalance] = await Promise.all([
        getNetworkBalance(sourceNetwork, sourceAsset),
        getNetworkBalance(destinationNetwork, destinationAsset),
      ])
      setSourceBalance(_sourceBalance)
      setDestinationBalance(_destinationBalance)
    } catch (err) {
      console.log(':: balance fetch err', err)
    } finally {
      setIsFetching(false)
    }
  }, [signer, chainId])

  return (
    <div className="flex flex-col gap-4">
      {_renderWallet()}
      <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
        <div className="font-normal flex flex-col w-full relative z-10 space-y-1">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Image src={sourceAsset.logo || ''} alt={sourceAsset.logo} width={32} height={32} className="rounded-full" />
              <div>
                <p className=" text-sm leading-5">{sourceNetwork.display_name}</p>
                <p className="text-sm ">{'Network'}</p>
              </div>
            </div>
            <div className="flex flex-col text-[#85c285]">
              <p className=" text-sm">
                {truncateDecimals(Number(sourceAmount), 6)} {sourceAsset.asset}
              </p>
              <p className=" text-sm flex justify-end">${truncateDecimals(Number(sourceAmount) * tokenPrice, 6)}</p>
            </div>
          </div>

          <div className="flex items-end gap-1 justify-end text-xs">
            {isFetching || !signer ? (
              <span className="ml-1 h-3 w-16 rounded-sm bg-level-3 animate-pulse" />
            ) : (
              <>
                <WalletIcon height={20} width={20} />
                <div className="opacity-80">
                  {truncateDecimals(Number(sourceBalance), 5)} {sourceAsset.asset}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="font-normal flex flex-col w-full relative z-10 space-y-1 mt-5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              {<Image src={destinationAsset.logo} alt={destinationAsset.logo} width={32} height={32} className="rounded-full" />}
              <div>
                <p className=" text-sm leading-5">{destinationNetwork.display_name}</p>
                <p className="text-sm ">{shortenAddress(destinationAddress)}</p>
              </div>
            </div>
            <div className="flex flex-col text-[#85c285]">
              <p className=" text-sm">
                {toMint ? truncateDecimals(Number(sourceAmount), 6) : truncateDecimals(Number(sourceAmount) * 0.99, 6)} {destinationAsset.asset}
              </p>
              <p className=" text-sm flex justify-end">
                ${toMint ? truncateDecimals(Number(sourceAmount) * tokenPrice, 6) : truncateDecimals(Number(sourceAmount) * 0.99 * tokenPrice, 6)}
              </p>
            </div>
          </div>
          <div className="flex items-end gap-1 justify-end text-xs">
            {isFetching || !signer ? (
              <span className="ml-1 h-3 w-16 rounded-sm bg-level-3 animate-pulse" />
            ) : (
              <>
                <WalletIcon height={20} width={20} />
                <div className="opacity-80">
                  {truncateDecimals(Number(destinationBalance), 5)} {destinationAsset.asset}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SwapItems
