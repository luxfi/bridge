import React from 'react'
import { swapStatusAtom, userTransferTransactionAtom } from '@/store/teleport'
import { ArrowRight, Router } from 'lucide-react'
import { Contract } from 'ethers'
import { CONTRACTS } from '@/components/lux/teleport/constants/settings'

import teleporterABI from '@/components/lux/teleport/constants/abi/bridge.json'
import erc20ABI from '@/components/lux/teleport/constants/abi/erc20.json'
//hooks
import { useChainId, useSwitchChain } from 'wagmi'
import { useAtom } from 'jotai'
import { useEthersSigner } from '@/lib/ethersToViem/ethers'
import { parseUnits } from 'ethers/lib/utils'

import axios from 'axios'
import useWallet from '@/hooks/useWallet'
import SwapItems from './SwapItems'
import SpinIcon from '@/components/icons/spinIcon'
import type { Network, Token } from '@/types/teleport'
import { useNotify } from '@/context/toast-provider'
import { localeNumber } from '@/lib/utils'

interface IProps {
  className?: string
  sourceNetwork: Network
  sourceAsset: Token
  destinationNetwork: Network
  destinationAsset: Token
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
  const [isTokenTransferring, setIsTokenTransferring] =
    React.useState<boolean>(false)
  const [userDepositNotice, setUserDepositNotice] = React.useState<string>('')
  //atoms
  const [, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setUserTransferTransaction] = useAtom(userTransferTransactionAtom)
  //hooks
  const signer = useEthersSigner()
  const { switchChain } = useSwitchChain()
  const { connectWallet } = useWallet()

  const isWithdrawal = React.useMemo(
    () => (sourceAsset.name.startsWith('Lux') ? true : false),
    [sourceAsset]
  )

  //chain id
  const chainId = useChainId()

  React.useEffect(() => {
    if (!signer) {
      connectWallet('evm')
    } else {
      if (chainId === sourceNetwork?.chain_id) {
        isWithdrawal ? burnToken() : transferToken()
      } else {
        sourceNetwork.chain_id &&
          switchChain &&
          switchChain({ chainId: sourceNetwork.chain_id })
      }
    }
  }, [chainId, signer, isWithdrawal])

  const transferToken = async () => {
    try {
      setIsTokenTransferring(true)
      console.log(sourceAmount, sourceAsset)
      const _amount = parseUnits(
        localeNumber(sourceAmount),
        sourceAsset.decimals
      )
      if (sourceAsset.is_native) {
        const _balance = await signer?.getBalance()
        console.log('::balance checking: ', {
          balance: Number(_balance) ?? 0,
          required: Number(_amount),
          gap: Number(_balance) ?? 0 - Number(_amount),
        })

        if (Number(_balance) < Number(_amount)) {
          notify(`Insufficient ${sourceAsset.asset} amount`, "warn")
          return
        }
      } else {
        const erc20Contract = new Contract(
          sourceAsset?.contract_address as string,
          erc20ABI,
          signer
        )
        // approve
        setUserDepositNotice(`Approving ${sourceAsset.asset}...`)
        const _balance = await erc20Contract.balanceOf(
          signer?._address as string
        )

        console.log(_amount)

        console.log('::balance checking: ', {
          balance: Number(_balance),
          required: Number(_amount),
          gap: Number(_balance) - Number(_amount),
        })

        if (Number(_balance) < Number(_amount)) {
          notify(`Insufficient ${sourceAsset.asset} amount`, "warn")
          return;
        }

        if (!sourceNetwork.chain_id) return
        // if allowance is less than amount, approve
        const _allowance = await erc20Contract.allowance(
          signer?._address as string,
          CONTRACTS[sourceNetwork.chain_id as keyof typeof CONTRACTS].teleporter
        )
        if (_allowance < _amount) {
          const _approveTx = await erc20Contract.approve(
            CONTRACTS[sourceNetwork.chain_id as keyof typeof CONTRACTS]
              .teleporter,
            _amount
          )
          await _approveTx.wait()
        }
      }

      if (!sourceNetwork.chain_id) return
      setUserDepositNotice(`Transfer ${sourceAsset.asset}...`)
      const bridgeContract = new Contract(
        CONTRACTS[sourceNetwork.chain_id as keyof typeof CONTRACTS].teleporter,
        teleporterABI,
        signer
      )

      const _bridgeTransferTx = await bridgeContract.vaultDeposit(
        _amount,
        sourceAsset.contract_address,
        {
          value: sourceAsset.is_native ? _amount : 0,
        }
      )
      await _bridgeTransferTx.wait()
      await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/transfer/${swapId}`,
        {
          txHash: _bridgeTransferTx.hash,
          amount: sourceAmount,
          from: signer?._address,
          to: CONTRACTS[sourceNetwork.chain_id as keyof typeof CONTRACTS]
            .teleporter,
        }
      )
      setUserTransferTransaction(_bridgeTransferTx.hash)
      setSwapStatus('teleport_processing_pending')
    } 
    catch (err) {
      console.log(err);
      if (String(err).includes("user rejected transaction")) {
        notify(`User rejected transaction`, "warn")
      } 
      else {
        notify(`Failed to run transaction`, "error")
      }
    } 
    finally {
      setIsTokenTransferring(false)
    }
  }

  const burnToken = async () => {
    try {
      setIsTokenTransferring(true)
      const _amount = parseUnits(String(sourceAmount), sourceAsset.decimals)

      const erc20Contract = new Contract(
        sourceAsset?.contract_address as string,
        erc20ABI,
        signer
      )
      setUserDepositNotice(`Checking token balance...`)
      const _balance = await erc20Contract.balanceOf(signer?._address as string)
      if (_balance < _amount) {
        notify(`Insufficient ${sourceAsset.asset} amount`, "warn")
        return
      }

      if (!sourceNetwork.chain_id) return
      setUserDepositNotice(`Burning ${sourceAsset.asset}...`)

      const bridgeContract = new Contract(
        CONTRACTS[sourceNetwork.chain_id as keyof typeof CONTRACTS].teleporter,
        teleporterABI,
        signer
      )

      console.log({
        _amount,
        _asset: sourceAsset.contract_address,
      })
      const _bridgeTransferTx = await bridgeContract.bridgeBurn(
        _amount,
        sourceAsset.contract_address
      )
      await _bridgeTransferTx.wait()
      await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/transfer/${swapId}`,
        {
          txHash: _bridgeTransferTx.hash,
          amount: sourceAmount,
          from: signer?._address,
          to: CONTRACTS[sourceNetwork.chain_id as keyof typeof CONTRACTS]
            .teleporter,
        }
      )
      setUserTransferTransaction(_bridgeTransferTx.hash)
      setSwapStatus('teleport_processing_pending')
    } catch (err) {
      console.log(err)
      if (String(err).includes("user rejected transaction")) {
        notify("User rejected transaction", "error")
      } else {
        notify("Failed to run transaction", "error")
      }
    } finally {
      setIsTokenTransferring(false)
    }
  }
  const handleTokenTransfer = async () => {
    if (!signer) {
      notify(
        "No connected wallet. Please connect your wallet",
        "error"
      )
      connectWallet("evm")
    } else if (chainId !== sourceNetwork.chain_id) {
      sourceNetwork.chain_id &&
        switchChain &&
        switchChain({ chainId: sourceNetwork.chain_id })
    } else {
      isWithdrawal ? burnToken() : transferToken()
    }
  }

  return (
    <div className={`w-full flex flex-col ${className} max-w-lg`}>
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
        <button
          disabled={isTokenTransferring}
          onClick={handleTokenTransfer}
          className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
        >
          {isTokenTransferring ? (
            <SpinIcon className="animate-spin h-5 w-5" />
          ) : (
            <ArrowRight />
          )}
          {isTokenTransferring ? (
            <span className="grow">{userDepositNotice}</span>
          ) : (
            <span className="grow">
              {isWithdrawal ? 'Burn' : 'Transfer'} {sourceAsset.asset}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

export default UserTokenDepositor
