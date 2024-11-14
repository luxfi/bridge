'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Info } from 'lucide-react'

import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@hanzo/ui/primitives'
import CommandWrapper from '@/components/shadcn/command-wrapper'

import { type ISelectMenuItem } from '../Shared/Props/selectMenuItem'
import useWindowDimensions from '../../../hooks/useWindowDimensions'
import SelectItem from '../Shared/SelectItem'
import { type SelectProps } from '../Shared/Props/SelectProps'
import Modal from '../../modal/modal'
import SpinIcon from '../../icons/spinIcon'
import { LayerDisabledReason } from '../Popover/PopoverSelect'

export interface CommandSelectProps extends SelectProps {
    show: boolean
    setShow: (value: boolean) => void
    searchHint: string
    valueGrouper: (values: ISelectMenuItem[]) => SelectMenuItemGroup[]
}

export class SelectMenuItemGroup {
    constructor(init?: Partial<SelectMenuItemGroup>) {
        Object.assign(this, init)
    }

    name: string = ''
    items: ISelectMenuItem[] = []
}

export default function CommandSelect({ values, value, setValue, show, setShow, searchHint, valueGrouper }: CommandSelectProps) {
    const { isDesktop } = useWindowDimensions()
    let groups: SelectMenuItemGroup[] = valueGrouper(values)
    return (
        <Modal height='full' show={show} setShow={setShow as Dispatch<SetStateAction<boolean>>}>
            {show ?
                <CommandWrapper>
                    <CommandInput autoFocus={isDesktop} placeholder={searchHint} />
                    {
                        value?.isAvailable.disabledReason === LayerDisabledReason.LockNetworkIsTrue &&
                        <div className='text-xs text-left  mb-2'>
                            <Info className='h-3 w-3 inline-block mb-0.5' /><span>&nbspYou&aposre accessing Bridge from a partner&aposs page. In case you want to transact with other networks, please open bridge.lux.network in a separate tab.</span>
                        </div>
                    }
                    {values ?
                        <CommandList>
                            <CommandEmpty>No results found.</CommandEmpty>
                            {groups.filter(g => g.items?.length > 0).map((group) => {
                                return (
                                    <CommandGroup key={group.name} heading={group.name}>
                                        {group.items.map(item =>
                                            <CommandItem disabled={!item.isAvailable.value} value={item.name} key={item.id} onSelect={() => {
                                                setValue(item)
                                                setShow(false)
                                            }}>
                                                <SelectItem item={item} />
                                            </CommandItem>)
                                        }
                                    </CommandGroup>)
                            })}
                        </CommandList>
                        :
                        <div className='flex justify-center h-full items-center'>
                            <SpinIcon className="animate-spin h-5 w-5" />
                        </div>
                    }
                </CommandWrapper>
                : <></>
            }
        </Modal>
    )
}