import { useCallback, useState } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger,
} from '@hanzo/ui/primitives'

import { type ISelectMenuItem, SelectMenuItem } from '../Shared/Props/selectMenuItem'
import PopoverSelect from './PopoverSelect'
import { CurrencyDisabledReason } from '../../Input/CurrencyFormField'

type PopoverSelectWrapper = {
    setValue: (value: ISelectMenuItem) => void;
    values: ISelectMenuItem[];
    value?: ISelectMenuItem;
    placeholder?: string;
    searchHint?: string;
    disabled?: boolean;
}

export default function PopoverSelectWrapper<T>({
    setValue,
    value,
    values,
    placeholder,
}: PopoverSelectWrapper) {
    const [showModal, setShowModal] = useState(false)

    const handleSelect = useCallback((item: ISelectMenuItem) => {
        setValue(item)
        setShowModal(false)
    }, [])

    if (!values) return <Placeholder placeholder={placeholder} />
    if (value?.isAvailable.disabledReason === CurrencyDisabledReason.LockAssetIsTrue) return <LockedAsset value={value} />

    return (
        <Popover open={showModal} onOpenChange={() => setShowModal(!showModal)}>
            <PopoverTrigger asChild>
                {
                    value ?
                        <div className="rounded-lg focus-peer:ring-foreground focus-peer:border-muted-3 focus-peer:border focus-peer:ring-1 focus:outline-none disabled:cursor-not-allowed relative grow flex items-center text-left justify-bottom w-full font-semibold align-sub ">
                            <button type='button' className='w-full py-0 border-transparent bg-transparent font-semibold rounded-md flex items-center justify-between'>
                                <span className="flex items-center text-xs md:text-base">
                                    <div className="flex-shrink-0 h-6 w-6 relative">
                                        {
                                            value.imgSrc && <Image
                                                src={value.imgSrc}
                                                alt="Project Logo"
                                                priority
                                                height="40"
                                                width="40"
                                                className="rounded-md object-contain"
                                            />
                                        }
                                    </div>
                                    <span className="ml-3 block">{value.name}</span>
                                </span>

                                <span className="ml-1 flex items-center pointer-events-none ">
                                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                </span>
                            </button>
                        </div>
                        :
                        <div className="rounded-lg focus-peer:ring-primary focus-peer:ring-1 focus:outline-none disabled:cursor-not-allowed relative grow flex items-center text-left justify-bottom w-full font-semibold align-sub ">
                            <button type='button' className='w-full py-0 border-transparent bg-transparent font-semibold rounded-md flex items-center justify-between'>
                                <div className="disabled:cursor-not-allowed relative grow flex items-center text-left w-full font-semibold">
                                    <span className="flex grow text-left items-center">
                                        <span className="block text-xs md:text-base font-medium text-muted-3 flex-auto items-center">
                                            {placeholder}
                                        </span>
                                    </span>
                                </div>


                                <span className="ml-1 flex items-center pointer-events-none">
                                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                </span>
                            </button>
                        </div>
                }
            </PopoverTrigger>
            <PopoverContent className="w-fit bg-[black] border-[#404040]">
                <PopoverSelect setValue={handleSelect} value={value} values={values} />
            </PopoverContent>
        </Popover>
    )
}

const Placeholder = ({ placeholder }: { placeholder: string | undefined }) => {
    return (
        <div className="rounded-lg focus-peer:ring-foreground focus-peer:ring-1 focus:outline-none disabled:cursor-not-allowed relative grow flex items-center text-left justify-bottom w-full font-semibold align-sub ">
            <div className="disabled:cursor-not-allowed relative grow flex items-center text-left w-full font-semibold">
                <span className="flex grow text-left items-center">
                    <span className="block text-xs md:text-base font-medium text-muted-3 flex-auto items-center">
                        {placeholder}
                    </span>
                </span>
            </div>
        </div>
    )
}

const LockedAsset = ({ value }: { value: ISelectMenuItem }) => {
    return (
        <div className="rounded-lg focus-peer:ring-foreground focus-peer:border-muted-1 focus-peer:border focus-peer:ring-1 focus:outline-none disabled:cursor-not-allowed relative grow h-12 flex items-center text-left justify-bottom w-full pl-3 pr-2 py-2 bg-level-1 border border-[#404040] font-semibold align-sub ">
            <div className='w-full border-transparent bg-transparent font-semibold rounded-md'>
                <span className="flex items-center">
                    <div className="flex-shrink-0 h-6 w-6 relative">
                        {
                            value?.imgSrc && <Image
                                src={value?.imgSrc}
                                alt="Project Logo"
                                priority
                                height="40"
                                width="40"
                                className="rounded-md object-contain"
                            />
                        }

                    </div>
                    <span className="ml-3 block truncate ">{value?.name}</span>
                </span>
            </div>
        </div>
    )
}