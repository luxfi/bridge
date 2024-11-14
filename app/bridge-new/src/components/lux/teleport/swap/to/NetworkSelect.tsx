'use client'
import type { Dispatch, SetStateAction } from 'react'

import {
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@hanzo/ui/primitives'
import CommandWrapper from '@/components/shadcn/command-wrapper'

import Modal from '@/components/modal/modal'
import useWindowDimensions from '@/hooks/useWindowDimensions'
import SelectItem from '@/components/lux/teleport/swap/to/SelectItem'
import SpinIcon from '@/components/icons/spinIcon'
import type { Network } from '@/types/teleport'

const CommandSelect: React.FC<{
  show: boolean
  setShow: (value: boolean) => void
  searchHint: string
  networks: Network[]
  network?: Network
  setNetwork: (value: Network) => void
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
          {networks ? (
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {networks.map((n: Network) => (
                <CommandItem
                  disabled={false}
                  value={n.internal_name}
                  key={n.internal_name}
                  onSelect={() => {
                    setNetwork(n)
                  }}
                  className={`${
                    n?.status == 'active' ? 'opacity-100' : 'opacity-50'
                  }`}
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
        <></>
      )}
    </Modal>
  )
}

export default CommandSelect
