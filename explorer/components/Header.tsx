'use client'

import BridgeExplorerLogo from './icons/BridgeExplorerLogo'
import Search from './Search'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Layers } from 'lucide-react'

export default function Header() {
  
    const pathname = usePathname();
    const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH
    const version = process.env.NEXT_PUBLIC_API_VERSION
    return (
        <header className="max-w-6xl w-full mx-auto">
            {
                version === 'sandbox' &&
                <div className='px-6 lg:px-8'>
                    <div className="h-0.5 bg-[#D95E1B] rounded-full " />
                    <div className="absolute -top-0.5 right-[calc(50%-68px)] bg-[#D95E1B] py-0.5 px-10 rounded-b-md text-xs scale-75 text-white">
                        TESTNET
                    </div>
                </div>
            }
            <nav className={`mx-auto max-w-6xl grid grid-cols-2 lg:grid-cols-6 lg:grid-rows-1 items-center gap-y-4 py-6 px-6 lg:px-8 ${pathname !== '/' ? 'grid-rows-2' : 'grid-rows-1'}`} aria-label="Global">
                <Link href="/" className="-m-1.5 p-1.5 order-1 col-span-1">
                    <BridgeExplorerLogo className="h-14 w-auto text-primary-logoColor" />
                </Link>
                <div className='max-w-2xl w-full  mx-auto order-3 lg:order-2 col-span-4'>
                    {!(pathname === '/' || pathname === basePath || pathname === `${basePath}/`) &&
                        <Search />
                    }
                </div>
                <div className="flex gap-x-2 sm:gap-x-4 order-2 lg:order-3 justify-self-end col-span-1">
                    <Link target='_blank' href={'https://www.bridge.lux.network/app'} className='px-2 sm:px-3 py-1 sm:py-2 bg-secondary-700 rounded-lg border shadow-sm border-white/10 hover:border-white/50 flex items-center gap-1 text-white text-sm sm:text-base duration-200 transition-colors'>
                        <Layers className='h-4 w-4' />
                        <span>App</span>
                    </Link>
                    <Link target='_blank' href={'https://docs.bridge.lux.network'} className='px-2 sm:px-3 py-1 sm:py-2 bg-secondary-700 rounded-lg border shadow-sm border-white/10 hover:border-white/50 flex items-center gap-1 text-white text-sm sm:text-base duration-200 transition-colors'>
                        <FileText className='h-4 w-4' />
                        <span>Docs</span>
                    </Link>
                </div>
            </nav>
        </header >
    )
}
