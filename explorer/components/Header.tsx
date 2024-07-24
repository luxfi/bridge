'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { FileText, Layers } from 'lucide-react'

import { Logo } from '@luxdefi/ui/common'
import { LinkElement } from '@luxdefi/ui/primitives'

import Search from './Search'

const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH
// const version = process.env.NEXT_PUBLIC_API_VERSION
const version = 'sandbox'

const Header: React.FC = () => {

  const pathname = usePathname(); // TODO make sandbox compnent lazyloaded, so this can be SSR'd

  return (
    <header className="max-w-6xl w-full mx-auto">
      {/* {
        version === 'sandbox' &&
        <div className='px-6 lg:px-8'>
          <div className="h-0.5 bg-[#D95E1B] rounded-full " />
          <div className="absolute -top-0.5 right-[calc(50%-68px)] bg-[#D95E1B] py-0.5 px-10 rounded-b-md text-xs scale-75 ">
            TESTNET
          </div>
        </div>
      } */}
      <nav className='mx-auto max-w-6xl flex flex-row items-center py-6 px-6' aria-label="Global">
        <Logo className="p-1.5 " />
        <div className='max-w-2xl w-full mx-auto '>
            {!(pathname === '/' || pathname === basePath || pathname === `${basePath}/`) &&
                <Search className="w-full px-6"/>
            }
        </div>
        <div className="flex gap-x-2 sm:gap-x-4  justify-self-end">
          <LinkElement
            def={{
              variant: 'outline',
              size: 'default',
              title: 'Bridge App',
              icon: <Layers className='h-4 w-4' />,
              href: 'https://bridge.lux.network'
            }}
            className='lg:min-w-0 gap-1'
          />
          <LinkElement
            def={{
              variant: 'outline',
              size: 'default',
              title: 'Docs',
              icon: <FileText className='h-4 w-4' />,
              href: 'https://docs.bridge.lux.network'
            }}
            className='lg:min-w-0 gap-1'
          />
        </div>
      </nav>
    </header >
  )
}

export default Header
