import React from 'react'
import toast from 'react-hot-toast'
import Web3 from 'web3'
import { useSwitchChain } from 'wagmi'
import { useAtom } from 'jotai'
import axios from 'axios'

import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui/primitives'

import {
  swapStatusAtom,
  userTransferTransactionAtom,
  mpcSignatureAtom,
} from "@/store/teleport";
import { CONTRACTS } from "@/components/lux/teleport/constants/settings";
import { useNotify } from '@/context/toast-provider';

//hooks
import { useEthersSigner } from "@/hooks/useEthersSigner";

import useWallet from '@/hooks/useWallet'
import SwapItems from './SwapItems'
import shortenAddress from '@/components/utils/ShortenAddress'
import Gauge from '@/components/gauge'
import { truncateDecimals } from '@/components/utils/RoundDecimals'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'

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
  //atoms
  const [userTransferTransaction] = useAtom(userTransferTransactionAtom)
  const [swapStatus, setSwapStatus] = useAtom(swapStatusAtom)
  const [, setMpcSignature] = useAtom(mpcSignatureAtom)
  //hooks
  const { chainId, signer, isConnecting } = useEthersSigner();
  const { switchChain } = useSwitchChain()
  const { connectWallet } = useWallet()

  const { notify } = useNotify();

  const toBurn = React.useMemo(
    () => ((sourceAsset.name.startsWith('Lux ') || sourceAsset.name.startsWith('Zoo ')) ? true : false),
    [sourceAsset]
  )
  const toMint = React.useMemo(
    () => ((destinationAsset.name.startsWith('Lux ') || destinationAsset.name.startsWith('Zoo ')) ? true : false),
    [destinationAsset]
  )

  React.useEffect(() => {
    if (isConnecting) return;

    if (!signer) {
        notify('Please connect wallet first.', 'info')
    } else {
      if (Number(chainId) === Number(sourceNetwork?.chain_id)) {
        getMpcSignature()
      } else {
        sourceNetwork.chain_id && switchChain && switchChain({ chainId: Number(sourceNetwork.chain_id) })
      }
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

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/getsig`,
        {
          method: 'POST', // Specify the method (GET is default, so it's optional here)
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(signData),
        }
      )
      const res = await response.json()
      console.log('data from mpc oracle network:::', res)
      if (res.status) {
        await axios.post(
          `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps/mpcsign/${swapId}`,
          {
            txHash: res.data.signature,
            amount: sourceAmount,
            from: signer?._address,
            to: CONTRACTS[
              Number(sourceNetwork?.chain_id) as keyof typeof CONTRACTS
            ].teleporter,
          }
        )
        setMpcSignature(res.data.signature)
        setSwapStatus('user_payout_pending')
      } else {
        const { msg } = res
        if (String(msg).includes("InvalidSenderError")) {
          notify("Invalid token sender. Try again using correct sender's account", 'warn')
        } else {
          notify('Failed to get signature from MPC oracle network, Please try again', 'error')
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
      notify("No connected wallet. Please connect your wallet", "warn");
      // connectWallet("evm")
    } else if (Number(chainId) !== Number(sourceNetwork?.chain_id)) {
      sourceNetwork.chain_id && switchChain && switchChain({ chainId: Number(sourceNetwork.chain_id) })
    } else {
      getMpcSignature()
    }
  }

  return (
    <div className={`flex flex-col ${className}`}>
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
