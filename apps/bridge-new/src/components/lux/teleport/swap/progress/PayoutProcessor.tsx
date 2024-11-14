import React from 'react'
import Web3 from 'web3'

import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui/primitives'

import { useNotify } from '@/context/toast-provider'

import {
  swapStatusAtom,
  mpcSignatureAtom,
  bridgeMintTransactionAtom,
  userTransferTransactionAtom,
} from '@/store/teleport'
import { Contract } from 'ethers'
import { CONTRACTS } from '@/components/lux/teleport/constants/settings'
import { ethers } from 'ethers'
import teleporterABI from '@/components/lux/teleport/constants/abi/bridge.json'
//hooks
import { useAtom } from 'jotai'
import { useEthersSigner } from '@/lib/ethersToViem/ethers'

import axios from 'axios'
import useWallet from '@/hooks/useWallet'
import SwapItems from './SwapItems'
import shortenAddress from '@/components/utils/ShortenAddress'
import SpinIcon from '@/components/icons/spinIcon'
import Gauge from '@/components/gauge'
import type { Network, Token } from '@/types/teleport'
import { ArrowRight } from 'lucide-react'
import { formatUnits, parseEther } from 'viem'
import { useChainId, useSwitchChain } from 'wagmi'
import { localeNumber } from '@/lib/utils'
import { parseUnits } from 'ethers/lib/utils'

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

const PayoutProcessor: React.FC<IProps> = ({
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
  const [isGettingPayout, setIsGettingPayout] = React.useState<boolean>(false)
  //atoms
  const [, setBridgeMintTransactionHash] = useAtom(bridgeMintTransactionAtom)
  const [userTransferTransaction] = useAtom(userTransferTransactionAtom)
  const [swapStatus, setSwapStatus] = useAtom(swapStatusAtom)
  const [mpcSignature] = useAtom(mpcSignatureAtom)
  //hooks
  const chainId = useChainId()
  const signer = useEthersSigner()
  const { switchChain } = useSwitchChain()
  const { connectWallet } = useWallet()

  const isWithdrawal = React.useMemo(
    () => (sourceAsset.name.startsWith('Lux') ? true : false),
    [sourceAsset]
  )

  React.useEffect(() => {
    if (!signer) {
      connectWallet('evm')
    } else {
      if (isWithdrawal) {
        if (chainId === destinationNetwork.chain_id) {
          withdrawDestinationToken()
        } else {
          destinationNetwork.chain_id &&
            switchChain &&
            switchChain({ chainId: destinationNetwork.chain_id })
        }
      } else {
        payoutDestinationToken()
      }
    }
  }, [swapStatus, chainId, signer, isWithdrawal])

  const payoutDestinationToken = async () => {
    const mintData = {
      hashedTxId_: Web3.utils.keccak256(userTransferTransaction),
      toTokenAddress_: destinationAsset?.contract_address,
      tokenAmount_: parseUnits(
        localeNumber(sourceAmount),
        sourceAsset.decimals
      ),
      fromTokenDecimals_: sourceAsset?.decimals,
      receiverAddress_: destinationAddress,
      signedTXInfo_: mpcSignature,
      vault_: 'true',
    }

    console.log('data for bridge mint::', mintData)

    try {
      setIsGettingPayout(true)
      // string memory hashedTxId_,
      // address toTokenAddress_,
      // uint256 tokenAmount_,
      // uint256 fromTokenDecimals_,
      // address receiverAddress_,
      // bytes memory signedTXInfo_,
      // string memory vault_
      if (!destinationNetwork.chain_id) return

      // Set up provider and wallet
      const provider = new ethers.providers.JsonRpcProvider(
        destinationNetwork.node
      )

      const feeData = await provider.getFeeData()
      console.log(feeData)

      // Replace with your private key (store it securely, not hardcoded in production)
      const privateKey = process.env.NEXT_PUBLIC_LUX_SIGNER
      const wallet = new ethers.Wallet(privateKey!, provider)

      const bridgeContract = new Contract(
        CONTRACTS[
          destinationNetwork.chain_id as keyof typeof CONTRACTS
        ].teleporter,
        teleporterABI,
        wallet
      )

      const _signer = await bridgeContract.previewBridgeStealth(
        mintData.hashedTxId_,
        mintData.toTokenAddress_,
        mintData.tokenAmount_,
        mintData.fromTokenDecimals_,
        mintData.receiverAddress_,
        mintData.signedTXInfo_,
        mintData.vault_
      )
      console.log('::signer', _signer)

      const _bridgePayoutTx = await bridgeContract.bridgeMintStealth(
        mintData.hashedTxId_,
        mintData.toTokenAddress_,
        mintData.tokenAmount_,
        mintData.fromTokenDecimals_,
        mintData.receiverAddress_,
        mintData.signedTXInfo_,
        mintData.vault_,
        {
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          gasLimit: 3000000,
        }
      )
      await _bridgePayoutTx.wait()
      /////////////////////// send 1 lux to users /////////////////////
      try {
        const luxSendTxData = {
          to: mintData.receiverAddress_,
          value: parseEther('1'), // eth to wei
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          gasLimit: 3000000,
        }
        //@ts-expect-error no check
        const _txSendLux = await wallet.sendTransaction(luxSendTxData)
        await _txSendLux.wait()
        console.log(
          `::1lux is sent to ${mintData.receiverAddress_}`,
          _txSendLux.hash
        )
      } catch (err) {
        console.log('::issue in sening 1 lux')
      }
      ///////////////////////////////////////////////////////////////////
      setBridgeMintTransactionHash(_bridgePayoutTx.hash)
      await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/payout/${swapId}`,
        {
          txHash: _bridgePayoutTx.hash,
          amount: sourceAmount,
          from: CONTRACTS[
            Number(sourceNetwork?.chain_id) as keyof typeof CONTRACTS
          ].teleporter,
          to: destinationAddress,
        }
      )
      setSwapStatus('payout_success')
    } catch (err) {
      console.log(err)
      if (String(err).includes("user rejected transaction")) {
        notify('User rejected transaction', "warn")
      } 
      else {
        notify('Failed to run transaction', "error")
      }
    } finally {
      setIsGettingPayout(false)
    }
  }

  const withdrawDestinationToken = async () => {
    const withdrawData = {
      hashedTxId_: Web3.utils.keccak256(userTransferTransaction),
      toTokenAddress_: destinationAsset?.contract_address,
      tokenAmount_: parseUnits(String(sourceAmount), sourceAsset.decimals),
      fromTokenDecimals_: sourceAsset?.decimals,
      receiverAddress_: destinationAddress,
      signedTXInfo_: mpcSignature,
      vault_: 'false',
    }

    // previewVaultWithdraw

    console.log('::data for bridge withdraw:', withdrawData)
    if (!destinationNetwork.chain_id) return
    try {
      const bridgeContract = new Contract(
        CONTRACTS[
          destinationNetwork.chain_id as keyof typeof CONTRACTS
        ].teleporter,
        teleporterABI,
        signer
      )

      const previewVaultWithdraw = await bridgeContract.previewVaultWithdraw(
        withdrawData.toTokenAddress_
      )
      console.log({
        balance: Number(
          formatUnits(previewVaultWithdraw, destinationAsset.decimals)
        ),
        todo: Number(sourceAmount),
      })

      if (
        Number(formatUnits(previewVaultWithdraw, destinationAsset.decimals)) <
        Number(sourceAmount)
      ) {
        notify(
          `Bridge doesnt have enough balance to withdraw. You can only withdraw ${Number(
            formatUnits(previewVaultWithdraw, destinationAsset.decimals)
          )}tokens now. Please wait for the withdrawal to be activated.`,
          'error'
        )
        return
      }
      // console.log("::canWithdraw", canWithdraw)
      setIsGettingPayout(true)
      // string memory hashedTxId_,
      // address toTokenAddress_,
      // uint256 tokenAmount_,
      // uint256 fromTokenDecimals_,
      // address receiverAddress_,
      // bytes memory signedTXInfo_,
      // string memory vault_

      const _signer = await bridgeContract.previewBridgeStealth(
        withdrawData.hashedTxId_,
        withdrawData.toTokenAddress_,
        withdrawData.tokenAmount_,
        withdrawData.fromTokenDecimals_,
        withdrawData.receiverAddress_,
        withdrawData.signedTXInfo_,
        withdrawData.vault_
      )
      console.log('::signer', _signer)

      const _bridgePayoutTx = await bridgeContract.bridgeWithdrawStealth(
        withdrawData.hashedTxId_,
        withdrawData.toTokenAddress_,
        withdrawData.tokenAmount_,
        withdrawData.fromTokenDecimals_,
        withdrawData.receiverAddress_,
        withdrawData.signedTXInfo_,
        withdrawData.vault_
      )
      await _bridgePayoutTx.wait()
      setBridgeMintTransactionHash(_bridgePayoutTx.hash)
      await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/payout/${swapId}`,
        {
          txHash: _bridgePayoutTx.hash,
          amount: sourceAmount,
          from: CONTRACTS[
            Number(sourceNetwork?.chain_id) as keyof typeof CONTRACTS
          ].teleporter,
          to: destinationAddress,
        }
      )
      setSwapStatus('payout_success')
    } 
    catch (err) {
      console.log(err)
      if (String(err).includes('user rejected transaction')) {
        notify('User rejected transaction', 'warn')
      } 
      else {
        notify('Failed to run transaction', 'error')
      }
    } 
    finally {
      setIsGettingPayout(false)
    }
  }

  const handlePayoutDestinationToken = () => {
    if (!signer) {
      notify(
        'No connected wallet. Please connect your wallet',
        'error'
      )
      connectWallet('evm')
    } else {
      if (isWithdrawal) {
        if (chainId === destinationNetwork.chain_id) {
          withdrawDestinationToken()
        } else {
          destinationNetwork.chain_id &&
            switchChain &&
            switchChain({ chainId: destinationNetwork.chain_id })
        }
      } else {
        payoutDestinationToken()
      }
    }
  }

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
        <div>
          <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
            <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
              <span className="animate-spin">
                <Gauge value={60} size="medium" />
              </span>
              <div className="mt-2">
                {isWithdrawal ? 'Withdraw' : 'Get'} Your{' '}
                {destinationAsset.asset}
              </div>
            </div>
            <div className="flex flex-col gap-2 py-5">
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-center text-sm">
                  <span>
                    {sourceAsset?.asset}{' '}
                    {isWithdrawal ? 'burnt' : 'transferred'}
                  </span>
                  <div className="underline flex gap-2 items-center">
                    {shortenAddress(userTransferTransaction)}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          target={'_blank'}
                          href={sourceNetwork?.transaction_explorer_template?.replace(
                            '{0}',
                            userTransferTransaction
                          )}
                          className="cursor-pointer"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-square-arrow-out-up-right"
                          >
                            <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
                            <path d="m21 3-9 9" />
                            <path d="M15 3h6v6" />
                          </svg>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Transaction</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-center text-sm">
                  <span>Teleporter has confirmed your Deposit</span>
                </div>
              </div>
            </div>
            <button
              disabled={isGettingPayout}
              onClick={handlePayoutDestinationToken}
              className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
            >
              {isGettingPayout ? (
                <SpinIcon className="animate-spin h-5 w-5" />
              ) : (
                <ArrowRight />
              )}
              <span className="grow">
                {isWithdrawal ? `Withdraw Your ${destinationAsset?.asset}` : `Get Your ${destinationAsset?.asset}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PayoutProcessor
