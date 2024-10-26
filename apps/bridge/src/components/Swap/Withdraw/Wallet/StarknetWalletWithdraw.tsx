'use client'
import { Link, ArrowLeftRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react'
import SubmitButton from '../../../buttons/submitButton';
import { useSwapDataState } from '../../../../context/swap';
import toast from 'react-hot-toast';
import { PublishedSwapTransactionStatus } from '../../../../lib/BridgeApiClient';
import { useSettings } from '../../../../context/settings';
import WarningMessage from '../../../WarningMessage';
import { Contract, type BigNumberish, cairo } from 'starknet';
import Erc20Abi from "../../../../lib/abis/ERC20.json"
import WatchDogAbi from "../../../../lib/abis/LSWATCHDOG.json"
import { useAuthState } from '../../../../context/authContext';
import KnownInternalNames from '../../../../lib/knownIds';
import { parseUnits } from 'viem'
import useWallet from '../../../../hooks/useWallet';
import { useSwapTransactionStore } from '../../../../stores/swapTransactionStore';

type Props = {
    depositAddress?: string;
    amount?: number
}

function getUint256CalldataFromBN(bn: BigNumberish) {
    return { ...cairo.uint256(bn) }
}

export function parseInputAmountToUint256(input: string, decimals: number = 18) {
    return getUint256CalldataFromBN(parseUnits(input, decimals).toString())
}

const StarknetWalletWithdrawStep: React.FC<Props> = ({ depositAddress, amount }) => {

    const [loading, setLoading] = useState(false)
    const [transferDone, setTransferDone] = useState<boolean>()
    const { getWithdrawalProvider: getProvider } = useWallet()
    const [isWrongNetwork, setIsWrongNetwork] = useState<boolean>()

    const { userId } = useAuthState()
    const { swap } = useSwapDataState()
    const { layers } = useSettings()

    const { setSwapTransaction } = useSwapTransactionStore();
    const { source_network: source_network_internal_name } = swap || {}
    const source_network = layers.find(n => n.internal_name === source_network_internal_name)
    const source_layer = layers.find(n => n.internal_name === source_network_internal_name)
    const sourceCurrency = source_network?.assets.find(c => c.asset?.toLowerCase() === swap?.source_asset?.toLowerCase())
    const sourceChainId = source_network?.chain_id

    const provider = useMemo(() => {
        return source_layer && getProvider(source_layer)
    }, [source_layer, getProvider])

    const wallet = provider?.getConnectedWallet()

    const handleConnect = useCallback(async () => {
        if (!provider)
            throw new Error(`No provider from ${source_layer?.internal_name}`)

        setLoading(true)
        try {
            await provider.connectWallet(source_layer?.chain_id)
        }
        catch( e: any ) {
            toast(e.message)
        }
        setLoading(false)
    }, [source_layer, provider])

    useEffect(() => {
        const connectedChainId = wallet?.chainId
        if (source_layer && connectedChainId && connectedChainId !== sourceChainId && provider) {
            (async () => {
                setIsWrongNetwork(true)
                await provider.disconnectWallet()
            })()
        } else if (source_layer && connectedChainId && connectedChainId === sourceChainId) {
            setIsWrongNetwork(false)
        }
    }, [wallet, source_layer, sourceChainId, provider])

    const handleTransfer = useCallback(async () => {
        if (!swap || !sourceCurrency) {
            return
        }
        setLoading(true)
        try {
            if (!wallet) {
                throw Error("starknet wallet not connected")
            }
            if (!sourceCurrency.contract_address) {
                throw Error("starknet contract_address is not defined")
            }
            if (!source_network?.metadata?.WatchdogContractAddress) {
                throw Error("WatchdogContractAddress is not defined on network metadata")
            }
            if (!amount) {
                throw Error("amount is not defined for starknet transfer")
            }
            if (!depositAddress) {
                throw Error("depositAddress is not defined for starknet transfer")
            }

            const erc20Contract = new Contract(
                Erc20Abi,
                sourceCurrency.contract_address,
                // :aa TODO ZACH
            //    wallet.metadata?.starknetAccount?.account,
            )

            const watchDogContract = new Contract(
                WatchDogAbi,
                source_network.metadata.WatchdogContractAddress,
                // :aa TODO ZACH
                //wallet.metadata?.starknetAccounts?.account
            )

            const call = erc20Contract.populate(
                "transfer",
                [
                    depositAddress,
                    parseInputAmountToUint256(amount.toString(), sourceCurrency?.decimals)
                ]
            );

            const watch = watchDogContract.populate(
                "watch",
                [swap.sequence_number],
            );

            try {
              /* :aa TODO ZACH
                const { transaction_hash: transferTxHash } = (await wallet?.metadata?.starknetAccount?.account?.execute([call, watch]) || {});
                if (transferTxHash) {
                    setSwapTransaction(swap.id, PublishedSwapTransactionStatus.Completed, transferTxHash);
                    setTransferDone(true)
                }
                else {
                    toast('Transfer failed or terminated')
                }
              */
            }
            catch( e: any ) {
                toast(e.message)
            }
        }
        catch( e: any ) {
            if (e?.message)
                toast(e.message)
        }
        setLoading(false)
    }, [wallet, swap, source_network, depositAddress, userId, sourceCurrency])

    return (
        <>
            <div className="w-full space-y-5 flex flex-col justify-between h-full ">
                <div className='space-y-4'>
                    {

                        isWrongNetwork &&
                        <WarningMessage messageType='warning'>
                            <span className='flex'>
                                {
                                    source_network_internal_name === KnownInternalNames.Networks.StarkNetMainnet
                                        ? <span>Please switch to Starknet Mainnet with your wallet and click Connect again</span>
                                        : <span>Please switch to Starknet Goerli with your wallet and click Connect again</span>
                                }
                            </span>
                        </WarningMessage>
                    }
                    {
                        !wallet &&
                        <div className="flex flex-row
                          text-base space-x-2">
                            <SubmitButton
                                isDisabled={loading}
                                isSubmitting={loading}
                                onClick={handleConnect}
                                icon={
                                    <Link
                                        className="h-5 w-5 ml-2"
                                        aria-hidden="true"
                                    />
                                } >
                                Connect wallet
                            </SubmitButton>
                        </div>
                    }
                    {
                        wallet
                        && depositAddress
                        && !isWrongNetwork
                        && <div className="flex flex-row
                         text-base space-x-2">
                            <SubmitButton
                                isDisabled={!!(loading || transferDone)}
                                isSubmitting={!!(loading || transferDone)}
                                onClick={handleTransfer}
                                icon={
                                    <ArrowLeftRight
                                        className="h-5 w-5 ml-2"
                                        aria-hidden="true"
                                    />
                                } >
                                Send from wallet
                            </SubmitButton>
                        </div>
                    }
                </div>
            </div >
        </>
    )
}


export default StarknetWalletWithdrawStep;