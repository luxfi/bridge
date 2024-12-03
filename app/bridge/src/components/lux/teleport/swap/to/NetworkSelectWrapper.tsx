'use client'
import { useCallback, useState } from 'react'
import Image from 'next/image'
import NetworkSelect from './NetworkSelect'
import { ChevronDown } from 'lucide-react'
import { cn } from '@hanzo/ui/util'
import type { CryptoNetwork } from '@/Models/CryptoNetwork'

export default function NetworkSelectWrapper<T>({
  network,
  setNetwork,
  networks,
  disabled,
  placeholder,
  searchHint,
  className,
}: {
  network?: CryptoNetwork
  networks: CryptoNetwork[]
  setNetwork: (network: CryptoNetwork) => void
  placeholder: string
  searchHint: string
  disabled: boolean
  className?: string
}) {
  const [showModal, setShowModal] = useState(false)

  function openModal() {
    setShowModal(true)
  }

  const handleSelect = useCallback((item: CryptoNetwork) => {
    if (item.status === 'active') {
      setNetwork(item)
      setShowModal(false)
    }
  }, [])

  return (<>
    <button
      type="button"
      onClick={openModal}
      disabled={disabled}
      className={cn(
        'focus-peer:ring-primary', 
        'focus-peer:border-muted-3 focus-peer:border focus-peer:ring-1 focus:outline-none', 
        'disabled:cursor-not-allowed relative grow h-12 flex items-center text-left', 
        'justify-bottom w-full pl-3 pr-4 py-2 border-b border-muted-3 font-semibold', 
        className
      )}
    >
      <span className="flex grow text-left items-center text-xs md:text-base">
        {network && (
          <div className="flex items-center">
            <div className="flex-shrink-0 h-6 w-6 relative">
              <Image
                src={network.logo || ''}
                alt="Project Logo"
                height="40"
                width="40"
                loading="eager"
                priority
                className="rounded-md object-contain"
              />
            </div>
          </div>
        )}
        {network ? (
          <span className="ml-3 block font-medium text-muted flex-auto items-center">
            {network.display_name}
          </span>
        ) : (
          <span className="block font-medium text-muted-2 flex-auto items-center">
            {placeholder}
          </span>
        )}
      </span>
      <span className="ml-3 right-0 flex items-center pointer-events-none">
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
    <NetworkSelect
      setShow={setShowModal}
      setNetwork={handleSelect}
      show={showModal}
      network={network}
      searchHint=""
      networks={networks}
    />
  </>)
}
