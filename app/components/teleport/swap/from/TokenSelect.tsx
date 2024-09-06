import { CommandItem, CommandList, CommandWrapper } from '../../../shadcn/command';
import { Token } from '@/types/teleport';
import React from 'react';
import Image from 'next/image';

interface IProps {
    values: Token[],
    value?: Token,
    setValue: (token: Token) => void
}

const TokenSelect: React.FC<IProps> = ({ values, value, setValue }) => {
    return (
        <CommandWrapper>
            <CommandList>
                {values.map(item => {
                    return (
                        <CommandItem
                            className={`border-t border-t-slate-500 justify-between gap-6 ${item.status !== 'active' && 'opacity-30'}`}
                            disabled={false}
                            value={item.asset}
                            key={item.asset}
                            onSelect={() => {
                                setValue(item);
                            }}
                        >
                            <div className="flex items-center w-full">
                                <div className="flex-shrink-0 h-6 w-6 relative">
                                    {
                                        item.logo &&
                                        <Image
                                            src={item.logo}
                                            alt="Project Logo"
                                            height="40"
                                            width="40"
                                            loading="eager"
                                            className="rounded-md object-contain"
                                        />
                                    }
                                </div>
                                <div className="ml-4 flex items-center gap-3 justify-between w-full">
                                    <p className='text-md font-medium'>
                                        {item.name}
                                    </p>
                                </div>
                            </div>
                            <div className='text-xs text-[white]/60'>{item.status === 'active' && 'active'}</div>
                        </CommandItem>
                    );
                })}
            </CommandList>
        </CommandWrapper>
    )
}

export default TokenSelect

export enum LayerDisabledReason {
    LockNetworkIsTrue = '',
    InsufficientLiquidity = 'Temporarily disabled. Please check later.'
}