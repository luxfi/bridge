import shortenAddress from '@/components/utils/ShortenAddress';
import React from 'react';
import Web3 from "web3";
import Image from 'next/image';
import SpinIcon from '@/components/icons/spinIcon';
import toast from "react-hot-toast"
import { Gauge } from '@/components/gauge';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
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
    bridgeTransferTransactionAtom,
    mpcSignatureAtom,
    bridgeMintTransactionAtom
} from '@/store/teleport'
import { truncateDecimals } from '@/components/utils/RoundDecimals';
import { ArrowRight, Router } from 'lucide-react';
import { Contract } from 'ethers';
import { CONTRACTS } from '@/components/teleport/constants/settings';

import teleporterABI from '../constants/abi/bridge.json'
import erc20ABI from '../constants/abi/erc20.json'
//hooks
import { useSwitchNetwork } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useAtom } from "jotai";
import { useEthersSigner } from '@/lib/ethersToViem/ethers';
import { useNetwork } from 'wagmi';
import { parseUnits } from '@/lib/resolveChain';
import axios from 'axios';
import useWallet from '@/hooks/useWallet';
import { getAddress } from 'ethers/lib/utils';

interface IProps {
    className?: string
}

const SwapDetails: React.FC<IProps> = ({ className }) => {

    //state
    const [isTokenTransferring, setIsTokenTransferring] = React.useState<boolean>(false);
    const [birdgeTransferNotice, setBridgeTranferNotice] = React.useState<string>("");
    const [isMpcSigning, setIsMpcSigning] = React.useState<boolean>(false);
    //atoms
    const [bridgeTransferTransactionHash, setBridgeTransferTransactionHash] = useAtom(bridgeTransferTransactionAtom);
    const [bridgeMintTransactionHash, setBridgeMintTransactionHash] = useAtom(bridgeMintTransactionAtom)
    const [sourceNetwork] = useAtom(sourceNetworkAtom);
    const [sourceAsset] = useAtom(sourceAssetAtom);
    const [destinationNetwork] = useAtom(destinationNetworkAtom);
    const [destinationAsset] = useAtom(destinationAssetAtom);
    const [destinationAddress] = useAtom(destinationAddressAtom);
    const [sourceAmount] = useAtom(sourceAmountAtom);
    const [swapStatus, setSwapStatus] = useAtom(swapStatusAtom);
    const [ethPrice] = useAtom(ethPriceAtom);
    const [swapId] = useAtom(swapIdAtom);
    const [mpcSignature] = useAtom(mpcSignatureAtom);
    //token price
    const tokenPrice = sourceAsset?.asset === 'ETH' ? ethPrice : 1.0;
    //hooks
    const signer = useEthersSigner({ chainId: sourceNetwork?.chain_id ?? 1 });
    const network = useNetwork();
    const { switchNetworkAsync } = useSwitchNetwork();
    const { connectWallet } = useWallet();

    /**
     * transfer token to lux vault by teleporter
     * @returns 
     */
    const handleTokenTransfer = async () => {
        if (!signer) {
            // toast.error(`No connected wallet. Please connect your wallet`);
            connectWallet('evm')
            return;
        }
        if (!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset || !switchNetworkAsync) {
            return;
        }
        try {
            setIsTokenTransferring(true);
            if (network?.chain?.id !== sourceNetwork.chain_id) {
                setBridgeTranferNotice(`Switching to ${sourceNetwork.display_name}...`);
                await switchNetworkAsync(sourceNetwork.chain_id)
            }

            const _amount = parseUnits(String(sourceAmount), sourceAsset.decimals);

            if (sourceAsset.is_native) {
                const _balance = await signer.getBalance();
                if (Number(_balance) < Number(_amount)) {
                    toast.error(`Insufficient ${sourceAsset.asset} amount`);
                    return;
                }
            } else {
                const erc20Contract = new Contract(
                    sourceAsset?.contract_address as string,
                    erc20ABI,
                    signer,
                );
                // approve
                setBridgeTranferNotice(`Approving ${sourceAsset.asset}...`);
                const _balance = await erc20Contract.balanceOf(signer?._address as string);
                if (_balance < _amount) {
                    toast.error(`Insufficient ${sourceAsset.asset} amount`);
                    return;
                }

                const _approveTx = await erc20Contract.approve(CONTRACTS[sourceNetwork.chain_id].teleporter, parseUnits(String(sourceAmount), sourceAsset.decimals))
                await _approveTx.wait();
            }

            setBridgeTranferNotice(`Transfer ${sourceAsset.asset}...`);
            const bridgeContract = new Contract(
                CONTRACTS[sourceNetwork.chain_id].teleporter,
                teleporterABI,
                signer,
            )

            const _bridgeTransferTx = await bridgeContract.vaultDeposit(
                _amount,
                sourceAsset.contract_address ?? '0x0000000000000000000000000000000000000000',
                { value: sourceAsset.contract_address ? 0 : _amount }
            );
            await _bridgeTransferTx.wait();
            await axios.post(`/api/swaps/transfer/${swapId}`, {
                txHash: _bridgeTransferTx.hash,
                amount: sourceAmount,
                from: signer?._address,
                to: CONTRACTS[sourceNetwork.chain_id].teleporter
            });
            setBridgeTransferTransactionHash(_bridgeTransferTx.hash);
            setSwapStatus("teleport_processing_pending");
        } catch (err) {
            console.log(err)
            if (String(err).includes("user rejected transaction")) {
                toast.error(`User rejected transaction`)
            } else {
                toast.error(`Failed to run transaction`)
            }
        } finally {
            setIsTokenTransferring(false);
        }
    }

    /**
     * get signature from teleport MPC network
     * @returns 
     */
    const getMpcSignature = async () => {

        setIsMpcSigning(true);
        if (!signer) {
            // toast.error(`No connected wallet. Please connect your wallet`);
            connectWallet('evm')
            return;
        }
        try {
            const msgSig = await signer?.signMessage("Sign to prove you are initiator of transaction.");
            const toNetIdHash = Web3.utils.keccak256(String(sourceNetwork?.chain_id));
            const toTargetAddrHash = Web3.utils.keccak256(String(destinationAddress)); //Web3.utils.keccak256(evmToAddress.slice(2));

            const url =
                `/api/teleport/getsig?` +
                `txid=${bridgeTransferTransactionHash}&` +
                `fromNetId=${sourceNetwork?.chain_id}&` +
                `toNetIdHash=${toNetIdHash}&` +
                `tokenName=${sourceAsset?.asset}&` +
                `tokenAddr=${destinationAsset?.contract_address}&` +
                `msgSig=${msgSig}&` +
                `toTargetAddrHash=${toTargetAddrHash}`;
            const response = await fetch(url, {
                method: 'GET', // Specify the method (GET is default, so it's optional here)
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const res = await response.json();

            console.log("data from mpc oracle network:::", { res })

            if (res.status) {
                await axios.post(`/api/swaps/mpcsign/${swapId}`, {
                    txHash: res.data.signature,
                    amount: sourceAmount,
                    from: signer?._address,
                    to: CONTRACTS[String(sourceNetwork?.chain_id)].teleporter
                });
                setSwapStatus("user_withdraw_pending");
            } else {
                toast.error(`Failed to get signature from MPC oracle network, Please try again`);
            }
        } catch (err) {
            console.log("mpc sign request failed:::", err)
        } finally {
            setIsMpcSigning(false);
        }
    }

    const mintDestinationToken = async () => {
        const data = {
            amt_: sourceAmount,
            hashedId_: Web3.utils.keccak256(bridgeTransferTransactionHash),
            toTargetAddrStr_: destinationAddress,
            signedTXInfo_: mpcSignature,
            tokenAddrStr_: destinationAsset?.contract_address,
            chainId_: sourceNetwork?.chain_id,
            fromTokenDecimal_: sourceAsset?.decimals,
            vault_: true
        }

        console.log(data)

        if (!signer) {
            // toast.error(`No connected wallet. Please connect your wallet`);
            connectWallet('evm')
            return;
        }
        if (!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset || !switchNetworkAsync) {
            return;
        }
        try {
            setIsTokenTransferring(true);
            // if (network?.chain?.id !== destinationNetwork.chain_id) {
            if (network?.chain?.id !== 11155111) {
                setBridgeTranferNotice(`Switching to ${sourceNetwork.display_name}...`);
                await switchNetworkAsync(11155111)
                // await switchNetworkAsync(destinationNetwork.chain_id)
            }
            const _amount = parseUnits(String(sourceAmount), sourceAsset.decimals);


            setBridgeTranferNotice(`Minting ${destinationAsset.asset}...`);
            const bridgeContract = new Contract(
                CONTRACTS[11155111].teleporter,
                // CONTRACTS[destinationNetwork.chain_id].teleporter,
                teleporterABI,
                signer,
            )

            const _bridgeMintTx = await bridgeContract.bridgeMintStealth(
                _amount,
                data.hashedId_,
                data.toTargetAddrStr_,
                data.signedTXInfo_,
                data.tokenAddrStr_,
                data.chainId_,
                data.fromTokenDecimal_,
                String(data.vault_)
            );
            await _bridgeMintTx.wait();
            await axios.post(`/api/swaps/success/${swapId}`, {
                txHash: _bridgeMintTx.hash,
                amount: sourceAmount,
                from: signer?._address,
                to: CONTRACTS[sourceNetwork.chain_id].teleporter
            });
            setBridgeMintTransactionHash(_bridgeMintTx.hash);
            setSwapStatus("success");
        } catch (err) {
            console.log(err)
            if (String(err).includes("user rejected transaction")) {
                toast.error(`User rejected transaction`)
            } else {
                toast.error(`Failed to run transaction`)
            }
        } finally {
            setIsTokenTransferring(false);
        }
    }

    React.useEffect(() => {
        if (swapStatus === "teleport_processing_pending") {
            getMpcSignature();
        } else if (swapStatus === "user_withdraw_pending") {
            mintDestinationToken();
        }
    }, [swapStatus]);


    const _renderSwapItems = () => (
        <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
            <div className="font-normal flex flex-col w-full relative z-10 space-y-4">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        {
                            sourceAsset &&
                            <Image
                                src={sourceAsset?.logo}
                                alt={sourceAsset?.logo}
                                width={32}
                                height={32}
                                className="rounded-full"
                            />
                        }
                        <div>
                            <p className=" text-sm leading-5">{sourceNetwork?.display_name}</p>
                            <p className="text-sm ">{'Network'}</p>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <p className=" text-sm">{truncateDecimals(Number(sourceAmount), 4)} {sourceAsset?.asset}</p>
                        <p className=" text-sm flex justify-end">${truncateDecimals(Number(sourceAmount) * tokenPrice, 4)}</p>
                    </div>
                </div>
            </div>
            <div className="font-normal flex flex-col w-full relative z-10 space-y-4 mt-5">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        {
                            destinationAsset &&
                            <Image
                                src={destinationAsset?.logo}
                                alt={destinationAsset?.logo}
                                width={32}
                                height={32}
                                className="rounded-full"
                            />
                        }
                        <div>
                            <p className=" text-sm leading-5">{destinationNetwork?.display_name}</p>
                            <p className="text-sm ">{shortenAddress(destinationAddress)}</p>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <p className=" text-sm">{truncateDecimals(Number(sourceAmount), 4)} {destinationAsset?.asset}</p>
                        <p className=" text-sm flex justify-end">${truncateDecimals(Number(sourceAmount) * tokenPrice, 4)}</p>
                    </div>
                </div>
            </div>
        </div>
    )

    const SuccessIcon = () => (
        <div className='flex place-content-center mb-4'>
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 116 116" fill="none">
                <circle cx="58" cy="58" r="58" fill="#55B585" fillOpacity="0.1" />
                <circle cx="58" cy="58" r="45" fill="#55B585" fillOpacity="0.3" />
                <circle cx="58" cy="58" r="30" fill="#55B585" />
                <path d="M44.5781 57.245L53.7516 66.6843L70.6308 49.3159" stroke="white" strokeWidth="3.15789" strokeLinecap="round" />
            </svg>
        </div>
    )

    if (!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset) {
        return (
            <div className="w-full h-[430px]">
                <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-6 py-1">
                        <div className="h-32 bg-level-1 rounded-lg"></div>
                        <div className="h-40 bg-level-1 rounded-lg"></div>
                        <div className="h-12 bg-level-1 rounded-lg"></div>
                    </div>
                </div>
            </div>
        )
    } else if (swapStatus === 'user_transfer_pending') {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <div className='space-y-5'>
                    <div className="w-full flex flex-col space-y-5">
                        {_renderSwapItems()}
                    </div>
                    <button disabled={isTokenTransferring} onClick={handleTokenTransfer} className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated">
                        {
                            isTokenTransferring ? <SpinIcon className="animate-spin h-5 w-5" /> : <ArrowRight />
                        }
                        {
                            isTokenTransferring ? <span className='grow'>{birdgeTransferNotice}</span> : <span className='grow'>Transfer {sourceAsset?.asset}</span>
                        }
                    </button>
                </div>
            </div>
        )
    } else if (swapStatus === "teleport_processing_pending") {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <div className='space-y-5'>
                    <div className="w-full flex flex-col space-y-5">
                        {_renderSwapItems()}
                    </div>
                    <div>
                        <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
                            <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
                                <span className="animate-spin">
                                    <Gauge value={60} size="medium" />
                                </span>
                                <div className='mt-2'>Signing MPC Network</div>
                                <div className='text-sm !mt-2'>Estimated processing time for confirmation: ~15s</div>
                            </div>
                            <div className='flex flex-col py-5 gap-3'>
                                <div className='flex gap-3 items-center'>
                                    <span className="">
                                        <Gauge value={100} size="verySmall" showCheckmark={true} />
                                    </span>
                                    <div className='flex flex-col items-center text-sm'>
                                        <span>{sourceAsset?.asset} transferred</span>
                                        <div className='underline flex gap-2 items-center'>
                                            {shortenAddress(bridgeTransferTransactionHash)}
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <a
                                                        target={"_blank"}
                                                        href={sourceNetwork?.transaction_explorer_template?.replace("{0}", bridgeTransferTransactionHash)}
                                                        className='cursor-pointer'
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-square-arrow-out-up-right"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" /><path d="m21 3-9 9" /><path d="M15 3h6v6" /></svg>
                                                    </a>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>View Transaction</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </div>
                                {
                                    isMpcSigning ?
                                        <div className='flex gap-3 items-center'>
                                            <span className="animate-spin">
                                                <Gauge value={60} size="verySmall" />
                                            </span>
                                            <div className='flex flex-col text-sm'>
                                                <span>Signing from MPC oracle network</span>
                                                <span>Waiting for confirmations</span>
                                            </div>
                                        </div>
                                        : <div className='flex gap-3 items-center'>
                                            <svg xmlns="http://www.w3.org/2000/svg" className='-ml-1' width="40" height="40" viewBox="0 0 116 116" fill="none">
                                                <circle cx="58" cy="58" r="58" fill="#E43636" fillOpacity="0.1" />
                                                <circle cx="58" cy="58" r="45" fill="#E43636" fillOpacity="0.5" />
                                                <circle cx="58" cy="58" r="30" fill="#E43636" />
                                                <path d="M48 69L68 48" stroke="white" strokeWidth="3.15789" strokeLinecap="round" />
                                                <path d="M48 48L68 69" stroke="white" strokeWidth="3.15789" strokeLinecap="round" />
                                            </svg>
                                            <div className='flex items-center gap-3 text-sm'>
                                                <span>Failed to Connect</span> <a onClick={getMpcSignature} className='underline font-bold cursor-pointer hover:font-extrabold text-[#77aa63]'>Try Again</a>
                                            </div>
                                        </div>
                                }

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    } else if (swapStatus === 'user_withdraw_pending') {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <div className='space-y-5'>
                    <div className="w-full flex flex-col space-y-5">
                        {_renderSwapItems()}
                    </div>
                    <div>
                        <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
                            <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
                                <span className="animate-spin">
                                    <Gauge value={60} size="medium" />
                                </span>
                                <div className='mt-2'>Withdraw Your LETH</div>
                            </div>
                            <div className='flex flex-col gap-2 py-5'>
                                <div className='flex gap-3 items-center'>
                                    <span className="">
                                        <Gauge value={100} size="verySmall" showCheckmark={true} />
                                    </span>
                                    <div className='flex flex-col items-center text-sm'>
                                        <span>{sourceAsset?.asset} transferred</span>
                                        <div className='underline flex gap-2 items-center'>
                                            {shortenAddress(bridgeTransferTransactionHash)}
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <a
                                                        target={"_blank"}
                                                        href={sourceNetwork?.transaction_explorer_template?.replace("{0}", bridgeTransferTransactionHash)}
                                                        className='cursor-pointer'
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-square-arrow-out-up-right"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" /><path d="m21 3-9 9" /><path d="M15 3h6v6" /></svg>
                                                    </a>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>View Transaction</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </div>
                                <div className='flex gap-3 items-center'>
                                    <span className="">
                                        <Gauge value={100} size="verySmall" showCheckmark={true} />
                                    </span>
                                    <div className='flex flex-col items-center text-sm'>
                                        <span>Teleporter has confirmed your Deposit</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={mintDestinationToken} className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated">
                                Withdraw Your {destinationAsset?.asset}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    } else if (swapStatus === 'success') {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <div className='space-y-5'>
                    <div className="w-full flex flex-col space-y-5">
                        {_renderSwapItems()}
                    </div>
                    <div>
                        <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
                            <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
                                <div className='mt-5'>
                                    <SuccessIcon />
                                </div>
                                <div className='!-mt-2'><span className=' text-[#7e8350] font-bold text-lg'>ETH -&gt; USD</span> Swap Success</div>
                            </div>
                            <div className='flex py-5'>
                                <div className='flex gap-3 items-center'>
                                    <span className="">
                                        <Gauge value={100} size="verySmall" showCheckmark={true} />
                                    </span>
                                    <div className='flex flex-col items-center text-sm'>
                                        <span>Teleporter has confirmed your Deposit</span>
                                    </div>
                                </div>
                            </div>
                            <div className='flex mb-3'>
                                <div className='flex gap-3 items-center'>
                                    <span className="">
                                        <Gauge value={100} size="verySmall" showCheckmark={true} />
                                    </span>
                                    <div className='flex flex-col text-sm'>
                                        <span>Your {destinationAsset?.asset} has been arrived</span>
                                        <div className='underline flex gap-2 items-center'>
                                            {shortenAddress(bridgeMintTransactionHash)}
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <a
                                                        target={"_blank"}
                                                        href={destinationNetwork?.transaction_explorer_template?.replace("{0}", bridgeMintTransactionHash)}
                                                        className='cursor-pointer'
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-square-arrow-out-up-right"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" /><path d="m21 3-9 9" /><path d="M15 3h6v6" /></svg>
                                                    </a>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>View Transaction</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        )
    }
}

export default SwapDetails;