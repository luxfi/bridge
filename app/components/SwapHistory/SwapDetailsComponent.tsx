import { useRouter } from 'next/router';
import { FC, useEffect, useState } from 'react'
import { useSettingsState } from '../../context/settings';
import BridgeApiClient, { SwapItem, TransactionType } from '../../lib/BridgeApiClient';
import Image from 'next/image'
import toast from 'react-hot-toast';
import shortenAddress from '../utils/ShortenAddress';
import CopyButton from '../buttons/copyButton';
import { SwapDetailsComponentSceleton } from '../Sceletons';
import StatusIcon from './StatusIcons';
import { ExternalLink } from 'lucide-react';
import isGuid from '../utils/isGuid';
import KnownInternalNames from '../../lib/knownIds';
import toastError from '../../helpers/toastError';

type Props = {
    id: string
}

const SwapDetails: FC<Props> = ({ id }) => {
    const [swap, setSwap] = useState<SwapItem>()
    const [loading, setLoading] = useState(false)
    const router = useRouter();
    const settings = useSettingsState()
    const { currencies, exchanges, networks, resolveImgSrc } = settings

    const { source_exchange: source_exchange_internal_name,
        destination_network: destination_network_internal_name,
        source_network: source_network_internal_name,
        destination_exchange: destination_exchange_internal_name,
        source_network_asset
    } = swap || {}

    const source = source_exchange_internal_name ? exchanges.find(e => e.internal_name === source_exchange_internal_name) : networks.find(e => e.internal_name === source_network_internal_name)
    const destination_exchange = destination_exchange_internal_name ? exchanges.find(e => e.internal_name === destination_exchange_internal_name) : null
    const exchange_currency = destination_exchange_internal_name ? destination_exchange?.currencies?.find(c => swap?.source_network_asset?.toUpperCase() === c?.asset?.toUpperCase() && c?.is_default) : null

    const destination_network = destination_network_internal_name ? networks.find(n => n.internal_name === destination_network_internal_name) : networks?.find(e => e?.internal_name?.toUpperCase() === exchange_currency?.network?.toUpperCase())

    const destination = destination_exchange_internal_name ? destination_exchange : networks.find(n => n.internal_name === destination_network_internal_name)

    const currency = currencies.find(c => c.asset === source_network_asset)

    const source_network = networks?.find(e => e.internal_name === source_network_internal_name)
    const input_tx_id = source_network?.transaction_explorer_template
    const swapInputTransaction = swap?.transactions?.find(t => t.type === TransactionType.Input)
    const swapOutputTransaction = swap?.transactions?.find(t => t.type === TransactionType.Output)

    useEffect(() => {
        (async () => {
            if (!id)
                return
            setLoading(true)
            try {
                const bridgeApiClient = new BridgeApiClient(router)
                const swapResponse = await bridgeApiClient.GetSwapDetailsAsync(id)
                setSwap(swapResponse.data)
            }
            catch (e) {
                toastError(e)
            }
            finally {
                setLoading(false)
            }
        })()
    }, [id, router.query])

    if (loading)
        return <SwapDetailsComponentSceleton />

    return (
        <>
            <div className="w-full grid grid-flow-row animate-fade-in">
                <div className="rounded-md w-full grid grid-flow-row">
                    <div className="items-center space-y-1.5 block text-base font-lighter leading-6 text-secondary-text">
                        <div className="flex justify-between p items-baseline">
                            <span className="text-left">Id </span>
                            <span className="text-primary-text">
                                <div className='inline-flex items-center'>
                                    {
                                        swap && <CopyButton toCopy={swap?.id} iconClassName="text-gray-500">
                                            {shortenAddress(swap?.id)}
                                        </CopyButton>
                                    }
                                </div>
                            </span>
                        </div>
                        <hr className='horizontal-gradient' />
                        <div className="flex justify-between p items-baseline">
                            <span className="text-left">Status </span>
                            <span className="text-primary-text">
                                {swap && <StatusIcon swap={swap} />}
                            </span>
                        </div>
                        <hr className='horizontal-gradient' />
                        <div className="flex justify-between items-baseline">
                            <span className="text-left">Date </span>
                            {swap && <span className='text-primary-text font-normal'>{(new Date(swap.created_date)).toLocaleString()}</span>}
                        </div>
                        <hr className='horizontal-gradient' />
                        <div className="flex justify-between items-baseline">
                            <span className="text-left">From  </span>
                            {
                                source && <div className="flex items-center">
                                    <div className="flex-shrink-0 h-5 w-5 relative">
                                        {
                                            <Image
                                                src={resolveImgSrc(source)}
                                                alt="Exchange Logo"
                                                height="60"
                                                width="60"
                                                layout="responsive"
                                                className="rounded-md object-contain"
                                            />
                                        }

                                    </div>
                                    <div className="mx-1 text-primary-text">{source?.display_name}</div>
                                </div>
                            }
                        </div>
                        <hr className='horizontal-gradient' />
                        <div className="flex justify-between items-baseline">
                            <span className="text-left">To </span>
                            {
                                destination && <div className="flex items-center">
                                    <div className="flex-shrink-0 h-5 w-5 relative">
                                        {
                                            <Image
                                                src={resolveImgSrc(destination)}
                                                alt="Exchange Logo"
                                                height="60"
                                                width="60"
                                                layout="responsive"
                                                className="rounded-md object-contain"
                                            />
                                        }
                                    </div>
                                    <div className="mx-1 text-primary-text">{destination?.display_name}</div>
                                </div>
                            }
                        </div>
                        <hr className='horizontal-gradient' />
                        <div className="flex justify-between items-baseline">
                            <span className="text-left">Address </span>
                            <span className="text-primary-text">
                                <div className='inline-flex items-center'>
                                    {swap && <CopyButton toCopy={swap.destination_address} iconClassName="text-gray-500">
                                        {swap?.destination_address.slice(0, 8) + "..." + swap?.destination_address.slice(swap?.destination_address.length - 5, swap?.destination_address.length)}
                                    </CopyButton>}
                                </div>
                            </span>
                        </div>
                        {swapInputTransaction?.transaction_id &&
                            <>
                                <hr className='horizontal-gradient' />
                                <div className="flex justify-between items-baseline">
                                    <span className="text-left">Source Tx </span>
                                    <span className="text-primary-text">
                                        <div className='inline-flex items-center'>
                                            <div className='underline hover:no-underline flex items-center space-x-1'>
                                                <a target={"_blank"} href={input_tx_id?.replace("{0}", swapInputTransaction.transaction_id)}>{shortenAddress(swapInputTransaction.transaction_id)}</a>
                                                <ExternalLink className='h-4' />
                                            </div>
                                        </div>
                                    </span>
                                </div>
                            </>
                        }
                        {swapOutputTransaction?.transaction_id &&
                            <>
                                <hr className='horizontal-gradient' />
                                <div className="flex justify-between items-baseline">
                                    <span className="text-left">Destination Tx </span>
                                    <span className="text-primary-text">
                                        <div className='inline-flex items-center'>
                                            <div className="">
                                                {(swapOutputTransaction?.transaction_id && swap?.destination_exchange === KnownInternalNames.Exchanges.Coinbase && (isGuid(swapOutputTransaction?.transaction_id))) ?
                                                    <span><CopyButton toCopy={swapOutputTransaction.transaction_id} iconClassName="text-gray-500">{shortenAddress(swapOutputTransaction.transaction_id)}</CopyButton></span>
                                                    :
                                                    <div className='underline hover:no-underline flex items-center space-x-1'>
                                                        <a target={"_blank"} href={destination_network?.transaction_explorer_template?.replace("{0}", swapOutputTransaction.transaction_id)}>{shortenAddress(swapOutputTransaction.transaction_id)}</a>
                                                        <ExternalLink className='h-4' />
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    </span>
                                </div>
                            </>
                        }
                        <hr className='horizontal-gradient' />
                        <div className="flex justify-between items-baseline">
                            <span className="text-left">Requested amount</span>
                            <span className='text-primary-text font-normal flex'>
                                {swap?.requested_amount} {swap?.destination_network_asset}
                            </span>
                        </div>
                        {
                            swapInputTransaction &&
                            <>
                                <hr className='horizontal-gradient' />
                                <div className="flex justify-between items-baseline">
                                    <span className="text-left">Transfered amount</span>
                                    <span className='text-primary-text font-normal flex'>
                                        {swapInputTransaction?.amount} {swap?.destination_network_asset}
                                    </span>
                                </div>
                            </>
                        }
                        {
                            swapOutputTransaction &&
                            <>
                                <hr className='horizontal-gradient' />
                                <div className="flex justify-between items-baseline">
                                    <span className="text-left">Bridge Fee </span>
                                    <span className='text-primary-text font-normal'>{swap?.fee} {currency?.asset}</span>
                                </div>
                            </>
                        }
                        {
                            swapOutputTransaction &&
                            <>
                                <hr className='horizontal-gradient' />
                                <div className="flex justify-between items-baseline">
                                    <span className="text-left">Amount You Received</span>
                                    <span className='text-primary-text font-normal flex'>
                                        {swapOutputTransaction?.amount} {currency?.asset}
                                    </span>
                                </div>
                            </>
                        }
                    </div>
                </div>
            </div>
        </>
    )
}

export default SwapDetails;
