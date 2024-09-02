'use client'
import { useCallback, useState, useEffect } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { ISelectMenuItem, SelectMenuItem } from '../Shared/Props/selectMenuItem'
import CommandSelect, { SelectMenuItemGroup } from './commandSelect'

type CommandSelectWrapperProps = {
    setValue: (value: ISelectMenuItem) => void;
    values: ISelectMenuItem[];
    value?: ISelectMenuItem;
    placeholder: string;
    searchHint: string;
    disabled: boolean;
    valueGrouper: (values: ISelectMenuItem[]) => SelectMenuItemGroup[];
    className?: string
}

export default function CommandSelectWrapper<T>({
    setValue,
    value,
    disabled,
    placeholder,
    searchHint,
    values,
    valueGrouper,
    className
}: CommandSelectWrapperProps) {
    const [showModal, setShowModal] = useState(false)

    function openModal() {
        setShowModal(true)
    }

    const handleSelect = useCallback((item: SelectMenuItem<T>) => {
        setValue(item)
        setShowModal(false)
    }, [])





    return (
        <>
            <div className="flex items-center relative">
                <button
                    type="button"
                    onClick={openModal}
                    disabled={disabled}
                    className={`rounded-lg focus-peer:ring-primary focus-peer:border-muted-3 focus-peer:border focus-peer:ring-1 focus:outline-none disabled:cursor-not-allowed relative grow h-12 flex items-center text-left justify-bottom w-full pl-3 pr-4 py-2 border border-muted-3 font-semibold ${className}`}
                >
                    <span className='flex grow text-left items-center text-xs md:text-base'>
                        {
                            value && <div className="flex items-center">
                                <div className="flex-shrink-0 h-6 w-6 relative">
                                    {
                                        value.imgSrc && <Image
                                            src={value.imgSrc}
                                            alt="Project Logo"
                                            height="40"
                                            width="40"
                                            loading="eager"
                                            priority
                                            className="rounded-md object-contain"
                                        />
                                    }

                                </div>
                            </div>
                        }
                        {value
                            ?
                            <span className="ml-3 block font-medium text-muted flex-auto items-center">
                                {value?.name}
                            </span>
                            :
                            <span className="block font-medium text-muted-2 flex-auto items-center">
                                {placeholder}
                            </span>}
                    </span>
                    <span className="ml-3 right-0 flex items-center pointer-events-none">
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </span>
                </button>
            </div>
            <CommandSelect
                setShow={setShowModal}
                setValue={handleSelect}
                show={showModal}
                value={value}
                searchHint={searchHint}
                valueGrouper={valueGrouper}
                values={values}
            />
        </>
    )
}
