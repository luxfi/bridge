import React from 'react'
import Image from 'next/image'
import CommandWrapper from '@/components/shadcn/command-wrapper'

import { cn } from '@hanzo/ui/util'
import { CommandItem, CommandList } from '@hanzo/ui/primitives'

import type { Token } from '@/types/teleport'

const TokenSelect: React.FC<{
  values: Token[]
  setValue: (token: Token) => void
}> = ({ values, setValue }) => (
  <CommandWrapper>
    <CommandList>
      {values.map((item) => (
        <CommandItem
          className={cn(
            'border-t border-t-slate-500 justify-between gap-6 hover:!bg-[#1F1F1F] aria-selected:!bg-[#1F1F1F] !border-none cursor-pointer',
            item.status !== 'active' && 'opacity-30'
          )}
          disabled={false}
          value={item.asset}
          key={item.asset}
          onSelect={() => {
            setValue(item)
          }}
        >
          <div className="flex items-center w-full">
            <div className="flex-shrink-0 h-6 w-6 relative">
              {item.logo && (
                <Image
                  src={item.logo}
                  alt="Project Logo"
                  height="40"
                  width="40"
                  loading="eager"
                  className="rounded-full object-contain"
                />
              )}
            </div>
            <div className="ml-4 flex items-center gap-3 justify-between w-full">
              <p className="text-md font-medium">{item.asset}</p>
            </div>
          </div>
          <div className="text-xs text-[white]/60">
            {item.status === 'active' && 'active'}
          </div>
        </CommandItem>
      ))}
    </CommandList>
  </CommandWrapper>
)

export default TokenSelect

export enum LayerDisabledReason {
  LockNetworkIsTrue = '',
  InsufficientLiquidity = 'Temporarily disabled. Please check later.',
}
