import React, { useState } from 'react'
import Image from 'next/image'
import TokenSelect from './TokenSelect'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover'
import { Token } from '@/types/teleport';

interface IProps {
  setValue: (value: Token) => void;
  values: Token[];
  value?: Token;
  placeholder?: string;
  searchHint?: string;
  disabled?: boolean;
}

const TokenSelectWrapper: React.FC<IProps> = ({
  setValue,
  value,
  values,
  placeholder,
  disabled
}) => {
  const [showModal, setShowModal] = React.useState(false)

  const handleSelect = React.useCallback((item: Token) => {
    if (item.status === 'active') {
      setValue(item);
      setShowModal(false);
    }
  }, [])

  if (values.length === 0) return <Placeholder placeholder={placeholder} />

  return (
    <Popover open={showModal} onOpenChange={() => setShowModal(!showModal)}>
      <PopoverTrigger asChild>
        {
          value ?
            <button type='button' className='py-0 border-transparent bg-transparent font-semibold rounded-md flex items-center justify-between'>
              <span className="flex items-center text-xs md:text-base">
                <div className="flex-shrink-0 h-6 w-6 relative">
                  {
                    value.logo && <Image
                      src={value.logo}
                      alt="Project Logo"
                      priority
                      height="40"
                      width="40"
                      className="rounded-md object-contain"
                    />
                  }
                </div>
                <span className="ml-3 block">{value.asset}</span>
              </span>

              <span className="ml-1 flex items-center pointer-events-none ">
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
            :
            <button type='button' className='py-0 border-transparent bg-transparent font-semibold rounded-md flex items-center justify-between'>
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
        }
      </PopoverTrigger>
      <PopoverContent className="w-fit bg-[black] border-[#404040]">
        <TokenSelect setValue={handleSelect} value={value} values={values} />
      </PopoverContent>
    </Popover>
  )
}

const Placeholder = ({ placeholder }: { placeholder: string | undefined }) => {
  return (
    <span className="block text-xs md:text-base font-medium text-muted-3 flex-auto items-center">
      {placeholder}
    </span>
  )
}

const LockedAsset = ({ value }: { value: Token }) => {
  return (
    <div className="rounded-lg focus-peer:ring-foreground focus-peer:border-muted-1 focus-peer:border focus-peer:ring-1 focus:outline-none disabled:cursor-not-allowed relative grow h-12 flex items-center text-left justify-bottom w-full pl-3 pr-2 py-2 bg-level-1 border border-[#404040] font-semibold align-sub ">
      <div className='w-full border-transparent bg-transparent font-semibold rounded-md'>
        <span className="flex items-center">
          <div className="flex-shrink-0 h-6 w-6 relative">
            {
              value?.logo && <Image
                src={value?.logo}
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

export default TokenSelectWrapper;