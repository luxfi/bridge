'use client'
import React from 'react'
import {
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from '@hanzo/ui/primitives'

import CommandWrapper from '@/components/shadcn/command-wrapper'

import Modal from '@/components/modal/modal'

import useWindowDimensions from '@/hooks/useWindowDimensions'
import SpinIcon from '@/components/icons/spinIcon'
import SelectItem from './SelectItem'
import type { CryptoNetwork } from '@/Models/CryptoNetwork'

interface IProps {
  show: boolean
  setShow: (value: boolean) => void
  searchHint: string
  networks: CryptoNetwork[],
  network?: CryptoNetwork
  setNetwork: (value: CryptoNetwork) => void
}

const CommandSelect: React.FC<IProps> = ({ 
  networks, 
  network, 
  setNetwork, 
  show, 
  setShow, 
  searchHint 
}) => {
  const { isDesktop } = useWindowDimensions()
  return (
    <Modal height='full' show={show} setShow={setShow as React.Dispatch<React.SetStateAction<boolean>>}>
    {show ?
        <CommandWrapper>
          <CommandInput autoFocus={isDesktop} placeholder={searchHint} />
          {networks && networks.length > 0 ?
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {networks.map((n: CryptoNetwork) => (
                <CommandItem
                  disabled={false}
                  value={n.internal_name}
                  key={n.internal_name}
                  onSelect={() => {
                      setNetwork(n)
                  }}
                  className={n?.status == 'active' ? 'opacity-100' : 'opacity-50'}
                >
                    <SelectItem network={n} />
                </CommandItem>
              ))}
            </CommandList>
            :
            <div className='flex justify-center h-full items-center'>
                <SpinIcon className='animate-spin h-5 w-5' />
            </div>
          }
        </CommandWrapper>
        : null
    }
    </Modal>
  )
}

export default CommandSelect