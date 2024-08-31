import React from 'react';
import { Container, UserCircle } from 'lucide-react';
import { Gauge } from '@/components/gauge';
import { Widget } from '@/components/Widget/Index';
import Image from 'next/image';
import {
    sourceNetworkAtom,
    sourceAssetAtom,
    destinationNetworkAtom,
    destinationAssetAtom,
    destinationAddressAtom,
    sourceAmountAtom,
} from '@/store/teleport'
import { useAtom } from "jotai";
import { truncateDecimals } from '@/components/utils/RoundDecimals';
import shortenAddress from '@/components/utils/ShortenAddress';
import SpinIcon from '@/components/icons/spinIcon';

interface IProps {
    className?: string
}

const SwapDetails: React.FC<IProps> = ({ className }) => {

    const [sourceNetwork, setSourceNetwork] = useAtom(sourceNetworkAtom);
    const [sourceAsset, setSourceAsset] = useAtom(sourceAssetAtom);
    const [destinationNetwork, setDestinationNetwork] = useAtom(destinationNetworkAtom);
    const [destinationAsset, setDestinationAsset] = useAtom(destinationAssetAtom);
    const [destinationAddress, setDestinationAddress] = useAtom(destinationAddressAtom);
    const [sourceAmount, setSourceAmount] = useAtom(sourceAmountAtom);

    const [swapStatus, setSwapStatus] = React.useState<string>("Transfer");

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
                        <p className=" text-sm flex justify-end">${'asdf'}</p>
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
                        <p className=" text-sm flex justify-end">${'asdf'}</p>
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
    } else if (swapStatus === 'Transfer') {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <div className='space-y-5'>
                    <div className="w-full flex flex-col space-y-5">
                        {_renderSwapItems()}
                    </div>
                    <button onClick={() => setSwapStatus("Withdraw")} className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated">
                        Transfer {sourceAsset?.asset}
                    </button>
                </div>
            </div>
        )
    } else if (swapStatus === 'Processing') {
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
                                <div className='text-sm !mt-2'>Estimated processing time for confirmation: ~15s</div>
                            </div>
                            <div className='flex py-5'>
                                <div className='flex gap-3 items-center'>
                                    <span className="animate-spin">
                                        <Gauge value={60} size="verySmall" />
                                    </span>
                                    <div className='flex flex-col items-center text-sm'>
                                        <span>Processing your transfer</span>
                                        <span>Waiting for confirmations</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    } else if (swapStatus === 'Withdraw') {
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
                                <div className='text-sm !mt-2'>Estimated processing time for confirmation: ~15s</div>
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
                            <button onClick={() => setSwapStatus("Success")} className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated">
                                Withdraw Your {destinationAsset?.asset}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    } else if (swapStatus === 'Success') {
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
                                    <div className='flex flex-col items-center text-sm'>
                                        <span>Your {destinationAsset?.asset} has been arrived</span>
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