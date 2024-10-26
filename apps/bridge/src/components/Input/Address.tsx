'use client'
import { type ChangeEvent, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from 'next/image';
import { useFormikContext } from "formik";
import { Info } from "lucide-react";

import { RadioGroup } from "@headlessui/react";

import { type AddressBookItem } from "@/lib/BridgeApiClient";
import { type SwapFormValues } from "../DTOs/SwapFormValues";
import { useSwapDataUpdate } from "@/context/swap";
import KnownInternalNames from "@/lib/knownIds";
import { useSettings } from "@/context/settings";
import { isValidAddress } from "@/lib/addressValidator";
import { type Partner } from "@/Models/Partner";
import shortenAddress from "../utils/ShortenAddress";
import AddressIcon from "../AddressIcon";
import WalletIcon from "../icons/WalletIcon";
import useWallet from "@/hooks/useWallet";

import { cn } from "@hanzo/ui/util"

interface Input extends Omit<React.HTMLProps<HTMLInputElement>, 'ref' | 'as' | 'onChange'> {
    hideLabel?: boolean;
    disabled: boolean;
    name: string;
    children?: JSX.Element | JSX.Element[];
    ref?: any;
    close: () => void,
    isPartnerWallet: boolean,
    partnerImage?: string,
    partner?: Partner,
    canFocus?: boolean,
    address_book?: AddressBookItem[]
}

const Address: React.FC<Input> = forwardRef<HTMLInputElement, Input>(function Address
    ({ name, canFocus, close, address_book, disabled, isPartnerWallet, partnerImage, partner }, ref) {
    const {
        values,
        setFieldValue
    } = useFormikContext<SwapFormValues>();

    const [wrongNetwork, setWrongNetwork] = useState(false)
    const inputReference = useRef<HTMLInputElement>(null);
    const destination = values.to
    const valid_addresses = address_book?.filter(a => a.networks?.some(n => destination?.internal_name === n) && isValidAddress(a.address, destination)) || []

    const { setDepositeAddressIsfromAccount, setAddressConfirmed } = useSwapDataUpdate()
    const placeholder = "Enter your address here"
    const [inputValue, setInputValue] = useState<string | undefined>(values?.destination_address || "")
    const [validInputAddress, setValidInputAddress] = useState<string | undefined>('')
    const destinationIsStarknet = destination?.internal_name === KnownInternalNames.Networks.StarkNetGoerli
        || destination?.internal_name === KnownInternalNames.Networks.StarkNetMainnet

    const { connectWallet, disconnectWallet, getAutofillProvider: getProvider } = useWallet()
    const provider = useMemo(() => {
        return values?.to && getProvider(values?.to)
    }, [values?.to, getProvider])

    const connectedWallet = provider?.getConnectedWallet()
    const settings = useSettings()

    useEffect(() => {
        if (destination && isValidAddress(connectedWallet?.address, destination) && !values?.destination_address) {
            //TODO move to wallet implementation
            if (connectedWallet
                && connectedWallet.providerName === 'starknet'
                && (connectedWallet.chainId != destinationChainId)
                && destination) {
                (async () => {
                    setWrongNetwork(true)
                    await disconnectWallet(connectedWallet.providerName)
                })()
                return
            }
            setInputValue(connectedWallet?.address)
            setAddressConfirmed(true)
            setFieldValue("destination_address", connectedWallet?.address)
        }
    }, [connectedWallet?.address, destination])

    useEffect(() => {
        if (canFocus) {
            inputReference?.current?.focus()
        }
    }, [canFocus])

    useEffect(() => {
        values.destination_address && setInputValue(values.destination_address)
    }, [values.destination_address])

    const handleRemoveDepositeAddress = useCallback(async () => {
        setDepositeAddressIsfromAccount(false)
        setFieldValue("destination_address", '')
        setInputValue("")
    }, [setDepositeAddressIsfromAccount, setFieldValue, values.to])

    const handleSelectAddress = useCallback((value: string) => {
        setAddressConfirmed(true)
        setFieldValue("destination_address", value)
        close()
    }, [close, setAddressConfirmed, setFieldValue])

    const inputAddressIsValid = isValidAddress(inputValue, destination)
    let errorMessage = '';
    if (inputValue && !isValidAddress(inputValue, destination)) {
        errorMessage = `Enter a valid ${values.to?.display_name} address`
    }

    const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value)
        setAddressConfirmed(false)
    }, [])

    useEffect(() => {
        if (inputAddressIsValid) {
            setValidInputAddress(inputValue)
        }
    }, [inputValue, inputAddressIsValid])

    const handleSetNewAddress = useCallback(() => {
        setAddressConfirmed(true)
        setFieldValue("destination_address", validInputAddress)
        close()
    }, [validInputAddress])

    const destinationAsset = values.toCurrency
    const destinationChainId = values?.to?.chain_id

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
                              placeholder={placeholder}
                              autoCorrect="off"
                              type={"text"}
                              disabled={disabled || !!(connectedWallet && values.destination_address)}
                              name={name}
                              id={name}
                              ref={inputReference}
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
                      <div className='flex  bg-level-3 flex-row items-left rounded-md p-2'>
                          {
                              destinationIsStarknet && connectedWallet ?
                                  <connectedWallet.icon className='rounded-md' alt={connectedWallet?.address} width={25} height={25} />
                                  :
                                  <AddressIcon address={validInputAddress} size={25} />
                          }
                      </div>
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
              {
                  !inputAddressIsValid
                  && destinationAsset
                  && values.toExchange
                  &&
                  <div className='text-left p-4 bg-level-1 rounded-lg border border-[#404040]'>
                      <div className="flex items-center">
                          <Info className='h-5 w-5 mr-3' />
                          <label className="block text-sm md:text-base font-medium leading-6">How to find your {values.toExchange.display_name} deposit address</label>
                      </div>
                      <ul className="list-disc font-light space-y-1 text-xs md:text-sm mt-2 ml-8">
                          <li>Go to the Deposits page</li>
                          <li>
                              <span>Select</span>
                              <span className="inline-block mx-1">
                                  <span className='flex gap-1 items-baseline text-sm '>
                                      <Image src={settings.resolveImgSrc(destinationAsset)}
                                          alt="Project Logo"
                                          height="15"
                                          width="15"
                                          className='rounded-sm'
                                      />
                                      <span>{destinationAsset.asset}</span>
                                  </span>
                              </span>
                              <span>as asset</span>
                          </li>
                          <li>
                              <span>Select</span>
                              <span className="inline-block mx-1">
                                  <span className='flex gap-1 items-baseline text-sm '>
                                      <Image src={settings.resolveImgSrc(values.toExchange)}
                                          alt="Project Logo"
                                          height="15"
                                          width="15"
                                          className='rounded-sm'
                                      />
                                      <span >{destination?.display_name}</span>
                                  </span>
                              </span>
                              <span>as network</span>
                          </li>
                      </ul>
                  </div>
              }
              {
                  !disabled && valid_addresses?.length > 0 && !inputValue &&
                  <div className="text-left">
                      <label className="">Recently used</label>
                      <RadioGroup disabled={disabled} value={values.destination_address} onChange={handleSelectAddress}>
                        <div className="rounded-md overflow-y-auto styled-scroll max-h-[300px]">
                        {valid_addresses?.map((a) => (
                          <RadioGroup.Option
                              key={a.address}
                              value={a.address}
                              disabled={disabled}
                              className={({ disabled }) => (
                                cn(
                                  disabled ? ' cursor-not-allowed ' : ' cursor-pointer ',
                                  'relative flex focus:outline-none mt-2 mb-3  '
                                )
                              )}
                          >
                          {({ checked }) => {
                            const difference_in_days = Math.round(Math.abs(((new Date()).getTime() - new Date(a.date).getTime()) / (1000 * 3600 * 24)))
                            return (
                              <RadioGroup.Description
                                  as="span"
                                  className={`space-x-2 flex text-sm rounded-md items-center w-full transform transition duration-200 px-2 py-1.5 border border-[#404040] hover:border-[#404040] hover:bg-level-1 hover:shadow-xl ${checked && 'border-muted-3'}`}
                              >
                                <div className='flex bg-level-3  flex-row items-left rounded-md p-2'>
                                    <AddressIcon address={a.address} size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <div className="block text-sm font-medium">
                                        {shortenAddress(a.address)}
                                    </div>
                                    <div className="text-gray-500">
                                        {
                                            difference_in_days === 0 ?
                                                <>Used today</>
                                                :
                                                (difference_in_days > 1 ?
                                                    <>Used {difference_in_days} days ago</>
                                                    : <>Used yesterday</>)
                                        }
                                    </div>
                                </div>
                              </RadioGroup.Description>
                            )
                          }}
                          </RadioGroup.Option>
                        ))}
                        </div>
                      </RadioGroup>
                  </div>
              }
          </div>
        </div>
      </div>
    )
})

export default Address
