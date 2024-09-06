'use client'
import { useFormikContext } from "formik";
import React, { ChangeEvent, FC, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddressBookItem } from "@/lib/BridgeApiClient";
import { SwapFormValues } from "@/components/DTOs/SwapFormValues";
import { useSwapDataUpdate } from "@/context/swap";
import { Info } from "lucide-react";
import KnownInternalNames from "@/lib/knownIds";
import { useSettingsState } from "@/context/settings";
import { isValidAddress } from "@/lib/addressValidator";
import { RadioGroup } from "@headlessui/react";
import Image from 'next/image';
import { Partner } from "@/Models/Partner";
import shortenAddress from "@/components/utils/ShortenAddress";
import AddressIcon from "@/components/AddressIcon";
import WalletIcon from "@/components/icons/WalletIcon";
import useWallet from "@/hooks/useWallet";
import { cn } from "@luxdefi/ui/util";

interface IProps extends Omit<React.HTMLProps<HTMLInputElement>, 'ref' | 'as' | 'onChange'> {
    hideLabel?: boolean;
    disabled: boolean;
    address: string,
    name: string;
    children?: JSX.Element | JSX.Element[];
    ref?: any;
    close: () => void,
    isPartnerWallet: boolean,
    partnerImage?: string,
    partner?: Partner,
    canFocus?: boolean,
    address_book?: AddressBookItem[],
    setAddress: React.Dispatch<React.SetStateAction<string>>
}

const Address: FC<IProps> = ({ name, canFocus, close, address_book, disabled, isPartnerWallet, partnerImage, partner, address, setAddress }) => {

    const [wrongNetwork, setWrongNetwork] = useState(false)
    const [inputValue, setInputValue] = useState<string | undefined>(address)
    const [validInputAddress, setValidInputAddress] = useState<string | undefined>('')

    const { connectWallet, disconnectWallet, getAutofillProvider: getProvider, getAutofillProviderWithNetworkName } = useWallet()
    const provider = getAutofillProviderWithNetworkName("ETHEREUM_MAINNET")

    const connectedWallet = provider?.getConnectedWallet()

    useEffect(() => {
        if (isValidAddress(connectedWallet?.address, { internal_name: "ETHEREUM_MAINNET" }) && !address) {
            //TODO move to wallet implementation
            if (connectedWallet
                && connectedWallet.providerName === 'starknet'
                && (connectedWallet.chainId != destinationChainId)
            ) {
                (async () => {
                    setWrongNetwork(true)
                    await disconnectWallet(connectedWallet.providerName)
                })()
                return
            }
            setInputValue(connectedWallet?.address)
            setAddress(connectedWallet?.address ?? "")
        }
    }, [connectedWallet?.address])

    useEffect(() => {
        address && setInputValue(address)
    }, [address])

    const destination = { internal_name: "ETHEREUM_MAINNET" }
    const inputAddressIsValid = isValidAddress(inputValue, destination)
    let errorMessage = '';
    if (inputValue && !isValidAddress(inputValue, destination)) {
        errorMessage = `Enter a valid LUX address`
    }

    const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value)
    }, [])

    useEffect(() => {
        if (inputAddressIsValid) {
            setValidInputAddress(inputValue)
        }
    }, [inputValue, inputAddressIsValid])

    const handleSetNewAddress = useCallback(() => {
        setAddress(validInputAddress ?? "")
        close()
    }, [validInputAddress])

    const handleRemoveDepositeAddress = useCallback(async () => {
        setAddress("")
        setInputValue("")
    }, [])

    const destinationChainId = 7777

    return (
        <div className='w-full flex flex-col justify-between h-full '>
            <div className='flex flex-col self-center grow w-full'>
                <div className='flex flex-col self-center grow w-full space-y-3'>
                    <div className="text-left">
                        <label htmlFor={name}>Address</label>
                        {isPartnerWallet && partner && <span className='truncate text-sm text-indigo-200'> ({partner?.display_name})</span>}
                        <div className="flex flex-wrap flex-col md:flex-row">
                            <div className="relative flex grow rounded-lg shadow-sm mt-1.5 bg-level-1 border-[#404040] border focus-within:ring-0 focus-within:ring-foreground focus-within:border-foreground">
                                {isPartnerWallet &&
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        {
                                            partnerImage &&
                                            <Image alt="Partner logo" className='rounded-md object-contain' src={partnerImage} width="24" height="24"></Image>
                                        }
                                    </div>
                                }
                                <input
                                    onChange={handleInputChange}
                                    value={inputValue}
                                    placeholder={"placeholder"}
                                    autoCorrect="off"
                                    type={"text"}
                                    disabled={disabled || !!(connectedWallet && address)}
                                    name={name}
                                    id={name}
                                    tabIndex={0}
                                    className={(isPartnerWallet ? 'pl-11' : '') +
                                        ' disabled:cursor-not-allowed grow h-12 border-none leading-4  block font-semibold w-full bg-level-1 rounded-lg truncate hover:overflow-x-scroll focus:ring-0 focus:outline-none'}
                                />
                                {
                                    inputValue && !disabled &&
                                    <span className="inline-flex items-center mr-2">
                                        <div className="text-xs flex items-center space-x-2 md:ml-5 bg-level-2 rounded-md ">
                                            <button
                                                type="button"
                                                className="p-0.5 duration-200 transition hover:bg-level-3 rounded-md"
                                                onClick={handleRemoveDepositeAddress}
                                            >
                                                <div className="flex items-center px-2 text-sm py-1 font-semibold">
                                                    Clear
                                                </div>
                                            </button>
                                        </div>
                                    </span>
                                }
                            </div>
                            {errorMessage &&
                                <div className="basis-full text-xs text-primary">
                                    {errorMessage}
                                </div>
                            }
                            {wrongNetwork && !inputValue &&
                                <div className="basis-full text-xs text-primary">
                                    {
                                        destination?.internal_name === KnownInternalNames.Networks.StarkNetMainnet
                                            ? <span>Please switch to Starknet Mainnet with your wallet and click Autofill again</span>
                                            : <span>Please switch to Starknet Goerli with your wallet and click Autofill again</span>
                                    }
                                </div>
                            }
                        </div>
                    </div>
                    {
                        validInputAddress &&
                        <div onClick={handleSetNewAddress} className='text-left min-h-12 cursor-pointer space-x-2 border border-muted bg-level-1 shadow-xl flex text-sm rounded-md items-center w-full transform hover:bg-level-2 transition duration-200 px-2 py-2 hover:border-foreground hover:shadow-xl'>
                            <div className="flex flex-col grow">
                                <div className="text-md font-medium ">
                                    {shortenAddress(validInputAddress)}
                                </div>
                            </div>
                            <div className='flex flex-row items-left px-2 py-1 rounded-md'>
                                Select
                            </div>
                        </div>
                    }
                    {
                        !disabled
                        && !inputValue
                        && destination
                        && provider
                        && !connectedWallet &&
                        <div onClick={() => { connectWallet(provider.name) }} className='min-h-12 text-left cursor-pointer space-x-2 bg-level-1  flex text-sm rounded-md items-center w-full transform transition duration-200 px-2 py-1.5 hover:bg-level-2 hover:shadow-xl'>
                            <div className='flexflex-row items-left bg-level-3 px-2 py-1 rounded-md'>
                                <WalletIcon className="w-6 h-6" />
                            </div>
                            <div className="flex flex-col">
                                <div className="block text-sm font-medium">
                                    Autofill from wallet
                                </div>
                                <div className="text-gray-500">
                                    Connect your wallet to fetch the address
                                </div>
                            </div>
                        </div>
                    }
                </div>
            </div>
        </div>
    )
}

export default Address
