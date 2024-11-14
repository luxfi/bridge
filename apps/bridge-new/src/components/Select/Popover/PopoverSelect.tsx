import React from 'react'
import {
  CommandItem,
  CommandList,
} from '@hanzo/ui/primitives'
import CommandWrapper from '@/components/shadcn/command-wrapper'

import { type SelectProps } from '../Shared/Props/SelectProps'

import SelectItem from '../Shared/SelectItem';

export default function PopoverSelect({ values, value, setValue }: SelectProps) {
    let upperValue = false;

    return (
        <CommandWrapper>
            <CommandList>
                {values.map(item => {
                    const shouldGroupped = !upperValue && item.isAvailable.value && item.isAvailable.disabledReason;

                    if (shouldGroupped) {
                        upperValue = true;
                    }

                    return (
                        <CommandItem
                            className={`${shouldGroupped ? 'border-t border-t-slate-500' : ''}`}
                            disabled={!item.isAvailable.value}
                            value={item.id}
                            key={item.id}
                            onSelect={() => {
                                setValue(item);
                            }}
                        >
                            <SelectItem item={item} />
                        </CommandItem>
                    );
                })}
            </CommandList>
        </CommandWrapper>
    )
}

export enum LayerDisabledReason {
    LockNetworkIsTrue = '',
    InsufficientLiquidity = 'Temporarily disabled. Please check later.'
}