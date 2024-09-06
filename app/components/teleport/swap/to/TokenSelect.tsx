import React from 'react';
import Image from 'next/image';
import { CommandItem, CommandList, CommandWrapper } from '../../../shadcn/command';
import { Token } from '@/types/teleport';

interface IProps {
    values: Token[],
    value?: Token,
    sourceAsset?: Token,
    setValue: (token: Token) => void,
    setShowModal: React.Dispatch<React.SetStateAction<boolean>>
}

const TokenSelect: React.FC<IProps> = ({ values, value, sourceAsset, setValue, setShowModal }) => {

    const pairCheck = (item: Token) => {
        return (sourceAsset?.asset === 'ETH' && item.asset === 'LETH') || (sourceAsset?.asset !== 'ETH' && item.asset === 'LUSD')
    }

    const handleSelect = React.useCallback((item: Token) => {
        if (item.status === 'active' && pairCheck(item)) {
            setValue(item);
            setShowModal(false);
        }
    }, [])

    return (
        <CommandWrapper>
            <CommandList>
                {values.map(item => {
                    return (
                        <CommandItem
                            className={`border-t border-t-slate-500 justify-between gap-6 ${!pairCheck(item) && 'opacity-30'}`}
                            disabled={false}
                            value={item.asset}
                            key={item.asset}
                            onSelect={() => {
                                handleSelect(item)
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
                            <div className='text-xs text-[white]/60'>{(item.status === 'active' && pairCheck(item)) && 'active'}</div>
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

export default TokenSelect