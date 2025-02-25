import React from 'react'
import { swapStatusAtom, userTransferTransactionAtom } from '@/store/teleport'
import { ArrowRight, Router, Wallet2Icon } from 'lucide-react'
import { Contract } from 'ethers'
import { CONTRACTS } from '@/components/lux/teleport/constants/settings'

import teleporterABI from '@/components/lux/teleport/constants/abi/bridge.json'
import erc20ABI from '@/components/lux/teleport/constants/abi/erc20.json'
//hooks
import { useSwitchChain } from 'wagmi'
import { useAtom } from 'jotai'
import { useEthersSigner } from '@/hooks/useEthersSigner'
import { parseUnits } from 'ethers/lib/utils'

import axios from 'axios'
import useWallet from '@/hooks/useWallet'
import SwapItems from './SwapItems'
import SpinIcon from '@/components/icons/spinIcon'
import { useNotify } from '@/context/toast-provider'
import { localeNumber } from '@/lib/utils'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'
import { useServerAPI } from '@/hooks/useServerAPI'

interface IProps {
  className?: string
  sourceNetwork: CryptoNetwork
  sourceAsset: NetworkCurrency
  destinationNetwork: CryptoNetwork
  destinationAsset: NetworkCurrency
  destinationAddress: string
  sourceAmount: string
  swapId: string
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
}) => {
  const { notify } = useNotify()
  //state
  const [isTokenTransferring, setIsTokenTransferring] = React.useState<boolean>(false)
  const [userDepositNotice, setUserDepositNotice] = React.useState<string>('Loading...')
  //atoms
  const [, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setUserTransferTransaction] = useAtom(userTransferTransactionAtom)
  //hooks
  const { serverAPI } = useServerAPI()
  const { chainId, signer, isConnecting } = useEthersSigner()
  const { switchChain } = useSwitchChain()
  const { connectWallet } = useWallet()

  const toBurn = React.useMemo(() => sourceAsset.mint, [sourceAsset])

  React.useEffect(() => {
    // console.log(signer?.provider.network.chainId)
    if (isConnecting || !signer) return

    if (Number(chainId) === Number(sourceNetwork?.chain_id)) {
      toBurn ? burnToken() : transferToken()
    } else {
      sourceNetwork.chain_id && switchChain && switchChain({ chainId: Number(sourceNetwork.chain_id) })
    }
  }, [signer])

  
  const transferToken = async () => {
    console.log(sourceAmount)
    try {
      setIsTokenTransferring(true)
      console.log(sourceAmount, sourceAsset, localeNumber(sourceAmount, sourceAsset.decimals))
      const _amount = parseUnits(localeNumber(sourceAmount, sourceAsset.decimals), sourceAsset.decimals)

      if (sourceAsset.asset === sourceNetwork.native_currency) {
        const _balance = await signer?.getBalance()
        console.log('::balance checking: ', {
          balance: Number(_balance) ?? 0,
          required: Number(_amount),
          gap: Number(_balance) ?? 0 - Number(_amount),
        })

        if (Number(_balance) < Number(_amount)) {
          notify(`Insufficient ${sourceAsset.asset} amount`, 'warn')
          return
        }
      } else {
        const erc20Contract = new Contract(sourceAsset?.contract_address as string, erc20ABI, signer)
        console.log({ erc20Contract, signer })
        // approve
        setUserDepositNotice(`Approving ${sourceAsset.asset}...`)
        const _balance = await erc20Contract.balanceOf(signer?._address as string)

        console.log('::balance checking: ', {
          balance: Number(_balance),
          required: Number(_amount),
          gap: Number(_balance) - Number(_amount),
        })

        if (Number(_balance) < Number(_amount)) {
          notify(`Insufficient ${sourceAsset.asset} amount`, 'warn')
          return
        }

        if (!sourceNetwork.chain_id) return
        // if allowance is less than amount, approve
        const _allowance = await erc20Contract.allowance(
          signer?._address as string,
          CONTRACTS[Number(sourceNetwork.chain_id) as keyof typeof CONTRACTS].teleporter
        )
        if (_allowance < _amount) {
          const _approveTx = await erc20Contract.approve(CONTRACTS[Number(sourceNetwork.chain_id) as keyof typeof CONTRACTS].teleporter, _amount)
          await _approveTx.wait()
        }
      }

      console.log("::amount", _amount)

      if (!sourceNetwork.chain_id) return
      setUserDepositNotice(`Transfer ${sourceAsset.asset}...`)
      const bridgeContract = new Contract(CONTRACTS[Number(sourceNetwork.chain_id) as keyof typeof CONTRACTS].teleporter, teleporterABI, signer)

      const _bridgeTransferTx = await bridgeContract.vaultDeposit(_amount, sourceAsset.contract_address, {
        value: sourceAsset.asset === sourceNetwork.native_currency ? _amount : 0,
      })
      await _bridgeTransferTx.wait()

      console.log('::swapId::save deposit to server:', swapId)

      await serverAPI.post(`/api/swaps/transfer/${swapId}`, {
        txHash: _bridgeTransferTx.hash,
        amount: sourceAmount,
        from: signer?._address,
        to: CONTRACTS[Number(sourceNetwork.chain_id) as keyof typeof CONTRACTS].teleporter,
      })
      setUserTransferTransaction(_bridgeTransferTx.hash)
      setSwapStatus('teleport_processing_pending')
    } catch (err) {
      console.log(err)
      if (String(err).includes('user rejected transaction')) {
        notify(`User rejected transaction`, 'warn')
      } else {
        notify(`Failed to run transaction`, 'error')
      }
    } finally {
      setIsTokenTransferring(false)
    }
  }

  const burnToken = async () => {
    try {
      setIsTokenTransferring(true)
      const _amount = parseUnits(localeNumber(sourceAmount, sourceAsset.decimals), sourceAsset.decimals)

      const erc20Contract = new Contract(sourceAsset?.contract_address as string, erc20ABI, signer)
      setUserDepositNotice(`Checking token balance...`)
      const _balance = await erc20Contract.balanceOf(signer?._address as string)

      console.log('::balance checking: ', {
        balance: Number(_balance),
        required: Number(_amount),
        gap: Number(_balance) - Number(_amount),
      })

      if (Number(_balance) < Number(_amount)) {
        notify(`Insufficient ${sourceAsset.asset} amount`, 'warn')
        return
      }

      if (!sourceNetwork.chain_id) return
      setUserDepositNotice(`Burning ${sourceAsset.asset}...`)

      const bridgeContract = new Contract(CONTRACTS[Number(sourceNetwork.chain_id) as keyof typeof CONTRACTS].teleporter, teleporterABI, signer)

      console.log({
        _amount,
        _asset: sourceAsset.contract_address,
      })
      const _bridgeTransferTx = await bridgeContract.bridgeBurn(_amount, sourceAsset.contract_address)
      await _bridgeTransferTx.wait()
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/transfer/${swapId}`, {
        txHash: _bridgeTransferTx.hash,
        amount: sourceAmount,
        from: signer?._address,
        to: CONTRACTS[Number(sourceNetwork.chain_id) as keyof typeof CONTRACTS].teleporter,
      })
      setUserTransferTransaction(_bridgeTransferTx.hash)
      setSwapStatus('teleport_processing_pending')
    } catch (err) {
      console.log(err)
      if (String(err).includes('user rejected transaction')) {
        notify('User rejected transaction', 'error')
      } else {
        notify('Failed to run transaction', 'error')
      }
    } finally {
      setIsTokenTransferring(false)
    }
  }
  const handleTokenTransfer = async () => {
    if (!signer) {
      notify('No connected wallet. Please connect your wallet', 'error')
      // connectWallet("evm")
    } else if (Number(chainId) !== Number(sourceNetwork.chain_id)) {
      sourceNetwork.chain_id && switchChain && switchChain({ chainId: Number(sourceNetwork.chain_id) })
    } else {
      toBurn ? burnToken() : transferToken()
    }
  }

  return (
    <div className={`flex flex-col ${className} max-w-lg`}>
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
        {!signer ? (
          <button
            onClick={() => connectWallet('evm')}
            className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
          >
            <Wallet2Icon className="h-5 w-5" />
            <span className="grow">Connect Wallet</span>
          </button>
        ) : (
          <button
            disabled={isTokenTransferring}
            onClick={handleTokenTransfer}
            className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
          >
            {isTokenTransferring ? <SpinIcon className="animate-spin h-5 w-5" /> : <ArrowRight />}
            {isTokenTransferring ? (
              <span className="grow">{userDepositNotice}</span>
            ) : (
              <span className="grow">
                {toBurn ? 'Burn' : 'Transfer'} {sourceAsset.asset}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default UserTokenDepositor
