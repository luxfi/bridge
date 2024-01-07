import React, { Dispatch, SetStateAction } from "react";
import { SelectMenuItem } from '../Shared/Props/selectMenuItem'
import {
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandWrapper
} from '../../shadcn/command'
import useWindowDimensions from '../../../hooks/useWindowDimensions';
import SelectItem from '../Shared/SelectItem';
import { SelectProps } from '../Shared/Props/SelectProps'
import Modal from '../../modal/modal';
import { Info } from 'lucide-react';
import { LayerDisabledReason } from '../Popover/PopoverSelect';

export interface CommandSelectProps<T> extends SelectProps<T> {
    show: boolean;
    setShow:  Dispatch<SetStateAction<boolean>>
    searchHint: string;
    valueGrouper: (values: SelectMenuItem<T>[]) => SelectMenuItemGroup<T>[];
}

export class SelectMenuItemGroup<T> {
    constructor(init?: Partial<SelectMenuItemGroup<T>>) {
        Object.assign(this, init);
    }

    name: string = ''
    items: SelectMenuItem<T>[] = []
}

export default function CommandSelect<T>({ 
  values, 
  setValue, 
  show, 
  setShow, 
  searchHint, 
  valueGrouper 
}: CommandSelectProps<T>) {

    const { isDesktop } = useWindowDimensions();
    let groups: SelectMenuItemGroup<T>[] = valueGrouper(values);
    return (
        <Modal height='full' show={show} setShow={setShow}>
            {show ?
                <CommandWrapper>
                    <CommandInput autoFocus={isDesktop} placeholder={searchHint} />
                    {
                        values.some(v => v.isAvailable.value === false && v.isAvailable.disabledReason === LayerDisabledReason.LockNetworkIsTrue) &&
                        <div className='text-xs text-left text-foreground text-foreground-new mb-2'>
                            <Info className='h-3 w-3 inline-block mb-0.5' /><span>&nbsp;You&apos;re accessing Bridge from a partner&apos;s page. In case you want to transact with other networks, please open bridge.lux.network in a separate tab.</span>
                        </div>
                    }
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
                                            <SelectItem<T> item={item} />
                                        </CommandItem>)
                                    }
                                </CommandGroup>)
                        })}
                    </CommandList>
                </CommandWrapper>
                : <></>
            }
        </Modal>
    )
}