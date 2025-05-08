import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import Web3 from 'web3'
import { useSwitchChain } from 'wagmi'
import { NetworkType } from '@/Models/CryptoNetwork'
import { useAtom } from 'jotai'
import axios from 'axios'

import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui/primitives'

import {
  swapStatusAtom,
  userTransferTransactionAtom,
  mpcSignatureAtom,
} from '@/store/teleport'
import { CONTRACTS } from '@/components/lux/teleport/constants/settings'
import { useNotify } from '@/context/toast-provider'

//hooks
import { useEthersSigner } from '@/hooks/useEthersSigner'

import useWallet from '@/hooks/useWallet'
import SwapItems from './SwapItems'
import shortenAddress from '@/components/utils/ShortenAddress'
import Gauge from '@/components/gauge'
import { truncateDecimals } from '@/components/utils/RoundDecimals'
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

const TeleportProcessor: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  swapId,
}) => {
  //state
  const [isMpcSigning, setIsMpcSigning] = React.useState<boolean>(false)
  const [xrpTxId, setXrpTxId] = useState<string>('')
  //atoms
  const [userTransferTransaction] = useAtom(userTransferTransactionAtom)
  const [swapStatus, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setMpcSignature] = useAtom(mpcSignatureAtom)
  //hooks
  const { chainId, signer, isConnecting } = useEthersSigner()
  const { switchChain } = useSwitchChain()
  const { connectWallet } = useWallet()
  const { serverAPI } = useServerAPI()
  const { notify } = useNotify()

  const toBurn = React.useMemo(
    () =>
      sourceAsset.name.startsWith('Liquid ') || sourceAsset.name.startsWith('Zoo ')
        ? true
        : false,
    [sourceAsset]
  )
  const toMint = React.useMemo(
    () =>
      destinationAsset.name.startsWith('Liquid ') ||
      destinationAsset.name.startsWith('Zoo ')
        ? true
        : false,
    [destinationAsset]
  )
  // Detect XRP deposit flow
  const isXrp = sourceNetwork?.type === NetworkType.XRP

  // Handler for XRP transaction hash input
  const handleXrpMpcSignature = async () => {
    if (!xrpTxId) {
      notify('Enter XRP transaction hash', 'warn')
      return
    }
    try {
      setIsMpcSigning(true)
      const receiverAddressHash = Web3.utils.keccak256(String(destinationAddress))
      const signData = {
        txId: xrpTxId,
        fromNetworkId: sourceNetwork?.chain_id,
        toNetworkId: destinationNetwork?.chain_id,
        toTokenAddress: destinationAsset?.contract_address,
        msgSignature: '',
        receiverAddressHash,
        nonce: 0
      }
      const { data } = await serverAPI.post(`/api/swaps/getsig`, signData)
      if (data.data) {
        await serverAPI.post(`/api/swaps/mpcsign/${swapId}`, {
          txHash: data.data.signature,
          amount: sourceAmount,
          from: data.data.mpcSigner,
          to: ''
        })
        setMpcSignature(data.data.signature)
        setSwapStatus('user_payout_pending')
      } else {
        notify('Failed to get MPC signature for XRP', 'error')
      }
    } catch (err) {
      console.error(err)
      notify('XRPL signing failed', 'error')
    } finally {
      setIsMpcSigning(false)
    }
  }

  React.useEffect(() => {
    // skip for XRP, handled via manual TX input
    if (sourceNetwork?.type === NetworkType.XRP) return
    if (isConnecting || !signer) return

    if (Number(chainId) === Number(sourceNetwork?.chain_id)) {
      getMpcSignature()
    } else {
      sourceNetwork.chain_id &&
        switchChain &&
        switchChain({ chainId: Number(sourceNetwork.chain_id) })
    }
  }, [signer])

  const getMpcSignature = async () => {
    try {
      setIsMpcSigning(true)
      const msgSignature = await signer?.signMessage(
        'Sign to prove you are initiator of transaction.'
      )
      // const toNetworkId = Web3.utils.keccak256(
      //   String(destinationNetwork?.chain_id)
      // );
      const toNetworkId = destinationNetwork?.chain_id
      const receiverAddressHash = Web3.utils.keccak256(
        String(destinationAddress)
      ) //Web3.utils.keccak256(evmToAddress.slice(2));

      const signData = {
        txId: userTransferTransaction,
        fromNetworkId: sourceNetwork?.chain_id,
        toNetworkId: toNetworkId,
        toTokenAddress: destinationAsset?.contract_address,
        msgSignature: msgSignature,
        receiverAddressHash: receiverAddressHash,
      }

      const { data } = await serverAPI.post(`/api/swaps/getsig`, signData)
      console.log('data from mpc oracle network:::', data)
      console.log('::swapId::save mpc signature to server:', swapId)
      if (data.data) {
        await serverAPI.post(`/api/swaps/mpcsign/${swapId}`, {
          txHash: data.data.signature,
          amount: sourceAmount,
          from: signer?._address + '###' + data.data.mpcSigner,
          to: CONTRACTS[
            Number(sourceNetwork?.chain_id) as keyof typeof CONTRACTS
          ].teleporter,
        })
        setMpcSignature(data.data.signature)
        setSwapStatus('user_payout_pending')
      } else {
        const { msg } = data
        if (String(msg).includes('InvalidSenderError')) {
          notify(
            "Invalid token sender. Try again using correct sender's account",
            'warn'
          )
        } else {
          notify(
            'Failed to get signature from MPC oracle network, Please try again',
            'error'
          )
        }
      }
    } catch (err) {
      console.log('mpc sign request failed:::', err)
    } finally {
      setIsMpcSigning(false)
    }
  }
  const handleGetMpcSignature = () => {
    if (!signer) {
      notify('No connected wallet. Please connect your wallet', 'warn')
      // connectWallet("evm")
    } else if (Number(chainId) !== Number(sourceNetwork?.chain_id)) {
      sourceNetwork.chain_id &&
        switchChain &&
        switchChain({ chainId: Number(sourceNetwork.chain_id) })
    } else {
      getMpcSignature()
    }
  }

  // XRP flow: manual transaction hash input
  if (isXrp) {
    return (
      <div className={`flex flex-col ${className}`}>
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
        <div className="mt-4">
          <label htmlFor="xrp-tx" className="text-sm font-medium">XRP Transaction Hash</label>
          <input
            id="xrp-tx"
            type="text"
            className="w-full mt-2 px-3 py-2 border rounded"
            placeholder="Enter XRP transaction hash"
            value={xrpTxId}
            onChange={(e) => setXrpTxId(e.target.value)}
          />
          <button
            onClick={handleXrpMpcSignature}
            disabled={isMpcSigning}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {isMpcSigning ? 'Signing...' : 'Get MPC Signature'}
          </button>
        </div>
      </div>
    )
  }
  return (
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
              <div className="mt-2">Signing from MPC Network</div>
              <div className="text-sm !mt-2">
                Estimated processing time for confirmation: ~15s
              </div>
            </div>
            <div className="flex flex-col py-5 gap-3">
              <div className="flex gap-3 items-start">
                <span className="">
                  <Gauge value={100} size="verySmall" showCheckmark={true} />
                </span>
                <div className="flex flex-col items-start text-sm">
                  <span>
                    {`${truncateDecimals(Number(sourceAmount), 6)} ${sourceAsset?.asset} ${toBurn ? 'burnt' : 'transferred'}`}
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
              {isMpcSigning ? (
                <div className="flex gap-3 items-center">
                  <span className="animate-spin">
                    <Gauge value={60} size="verySmall" />
                  </span>
                  <div className="flex flex-col text-sm">
                    <span>Signing from MPC oracle network</span>
                    <span>Waiting for confirmations</span>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="-ml-1"
                    width="40"
                    height="40"
                    viewBox="0 0 116 116"
                    fill="none"
                  >
                    <circle
                      cx="58"
                      cy="58"
                      r="58"
                      fill="#E43636"
                      fillOpacity="0.1"
                    />
                    <circle
                      cx="58"
                      cy="58"
                      r="45"
                      fill="#E43636"
                      fillOpacity="0.5"
                    />
                    <circle cx="58" cy="58" r="30" fill="#E43636" />
                    {/* <path d="M48 69L68 48" stroke="white" strokeWidth="3.15789" strokeLinecap="round" />
                                            <path d="M48 48L68 69" stroke="white" strokeWidth="3.15789" strokeLinecap="round" /> */}
                  </svg>
                  <div className="flex items-center gap-3 text-sm">
                    <span>Signing from MPC Oracle</span>{' '}
                    <a
                      onClick={handleGetMpcSignature}
                      className="underline font-bold cursor-pointer hover:font-extrabold text-[#77aa63]"
                    >
                      Try Again
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TeleportProcessor
