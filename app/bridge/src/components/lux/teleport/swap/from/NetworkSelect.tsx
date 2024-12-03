'use client'
import type { Dispatch, SetStateAction } from 'react'
import Modal from '@/components/modal/modal'
import SpinIcon from '@/components/icons/spinIcon'
import SelectItem from './SelectItem'
import CommandWrapper from '@/components/shadcn/command-wrapper'
import useWindowDimensions from '@/hooks/useWindowDimensions'

import {
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@hanzo/ui/primitives'
import type { CryptoNetwork } from '@/Models/CryptoNetwork'

const CommandSelect: React.FC<{
  show: boolean
  setShow: (value: boolean) => void
  searchHint: string
  networks: CryptoNetwork[]
  network?: CryptoNetwork
  setNetwork: (value: CryptoNetwork) => void
}> = ({ networks, network, setNetwork, show, setShow, searchHint }) => {
  const { isDesktop } = useWindowDimensions()
  return (
    <Modal
      height="full"
      show={show}
      setShow={setShow as Dispatch<SetStateAction<boolean>>}
    >
      {show ? (
        <CommandWrapper>
          <CommandInput autoFocus={isDesktop} placeholder={searchHint} />
          {networks && networks.length > 0 ? (
            <CommandList className='max-h-full'>
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
          ) : (
            <div className="flex justify-center h-full items-center">
              <SpinIcon className="animate-spin h-5 w-5" />
            </div>
          )}
        </CommandWrapper>
      ) : (
        null
      )}
    </Modal>
  )
}

export default CommandSelect
