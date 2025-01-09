'use client'
import { useCallback, useRef, type PropsWithChildren } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@hanzo/ui/util'

import HeaderWithMenu from '../HeaderWithMenu'
import Content from './Content'
import Footer from './Footer'
import resolvePersistentQueryParams from '@/util/resolvePersistentQueryParams'
import BridgeApiClient from '@/lib/BridgeApiClient'
import GotoExchange from '../BridgeMenu/GotoExchange'

const Widget = ({
  children,
  className = '',
  hideMenu,
}: {
  className?: string
  hideMenu?: boolean
} & PropsWithChildren) => {
  const router = useRouter()
  const canGoBackRef = useRef<boolean>(false)

  const searchParams = useSearchParams()
  const paramString = resolvePersistentQueryParams(searchParams).toString()

  // https://stackoverflow.com/questions/71853839/how-to-check-if-userouter-can-use-router-back-in-nextjs-app
  const goBack = useCallback(() => {
    canGoBackRef.current = !!(window.history?.length && window.history.length > 1)
    if (canGoBackRef.current) {
      router.back()
    } else {
      router.push('/' + (paramString ? '?' + paramString : ''))
    }
  }, [paramString])

  const sandbox = BridgeApiClient.apiVersion === 'sandbox'

  return (
    <div>
      <div id="WIDGET_OUTER" className="flex flex-col content-center items-center justify-center xs:w-full md:w-auto">
        <div id="WIDGET" className={cn('text-foreground md:rounded-lg w-full sm:overflow-hidden relative md:border border-[#2a2a2a]', className)}>
          {sandbox && (
            <div className="relative">
              <div className="h-1 bg-secondary" />
              <div className="absolute cursor-default -top-0.5 right-[calc(50%-68px)] bg-secondary py-0.5 px-10 rounded-b-md text-xs scale-75">
                TESTNET
              </div>
            </div>
          )}
          {!hideMenu && <HeaderWithMenu goBack={canGoBackRef.current ? goBack : undefined} />}
          <div className="w-full h-full px-3 md:px-6 pb-6 mt-3 flex flex-col justify-between">{children}</div>
          <div id="modal_portal_root" />
          <GotoExchange className='md:hidden flex px-3'/>
        </div>
      </div>
      <GotoExchange className='mt-4 mx-auto md:flex hidden'/>
    </div>
  )
}

Widget.Content = Content
Widget.Footer = Footer

export default Widget
