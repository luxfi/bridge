'use client'
import React from "react";
import { ISelectMenuItem } from '@/components/Teleport/Select/Shared/Props/selectMenuItem'
import {
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandWrapper
} from '@/components/shadcn/command'
import useWindowDimensions from '@/hooks/useWindowDimensions';
import SpinIcon from "@/components/icons/spinIcon";
import SelectItem from '@/components/Teleport/Select/Shared/SelectItem';
import Modal from '@/components/modal/modal';
import { SelectProps } from '@/components/Teleport/Select/Shared/Props/SelectProps'
import { Info } from 'lucide-react';
import { LayerDisabledReason } from '@/components/Teleport/Select/Popover/PopoverSelect';

export interface CommandSelectProps extends SelectProps {
    show: boolean;
    setShow: (value: boolean) => void;
    searchHint: string;
    valueGrouper: (values: ISelectMenuItem[]) => SelectMenuItemGroup[];
}

export class SelectMenuItemGroup {
    constructor(init?: Partial<SelectMenuItemGroup>) {
        Object.assign(this, init);
    }

    name: string;
    items: ISelectMenuItem[];
}

export default function CommandSelect({ values, value, setValue, show, setShow, searchHint, valueGrouper }: CommandSelectProps) {
    const { isDesktop } = useWindowDimensions();
    let groups: SelectMenuItemGroup[] = valueGrouper(values);
    return (
        <Modal height='full' show={show} setShow={setShow}>
            {show ?
                <CommandWrapper>
                    <CommandInput autoFocus={isDesktop} placeholder={searchHint} />
                    {
                        value?.isAvailable.disabledReason === LayerDisabledReason.LockNetworkIsTrue &&
                        <div className='text-xs text-left  mb-2'>
                            <Info className='h-3 w-3 inline-block mb-0.5' /><span>&nbsp;You&apos;re accessing Bridge from a partner&apos;s page. In case you want to transact with other networks, please open bridge.lux.network in a separate tab.</span>
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