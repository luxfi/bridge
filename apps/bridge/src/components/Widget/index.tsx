'use client'
import { useCallback, useRef, type PropsWithChildren } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import HeaderWithMenu from '../HeaderWithMenu'
import Content  from './Content'
import Footer from './Footer'
import resolvePersistentQueryParams from '@/util/resolvePersistentQueryParams'
import BridgeApiClient from '@/lib/BridgeApiClient'

const Widget = ({ 
  children, 
  className='', 
  hideMenu 
}: {
  className?: string
  hideMenu?: boolean
} & PropsWithChildren) => {

  const router = useRouter()
  const canGoBackRef = useRef<boolean>(false)

  const searchParams = useSearchParams()
  const paramString = resolvePersistentQueryParams(searchParams)


    // https://stackoverflow.com/questions/71853839/how-to-check-if-userouter-can-use-router-back-in-nextjs-app
  const goBack = useCallback(() => {
    canGoBackRef.current = !!(window.history?.length && window.history.length > 1)
    if (canGoBackRef.current) {
      router.back()
    }
    else {
      router.push('/' + (paramString ? ('?' + paramString) : '' )) 
    }
  }, [paramString])


  const sandbox = BridgeApiClient.apiVersion === 'sandbox'

  return (
    <div id='WIDGET_OUTER' className='flex flex-col content-center items-center justify-center'>
      <div id='WIDGET' className={'text-foreground rounded-lg w-full sm:overflow-hidden relative border ' + className}>
        {sandbox && (
          <div className='relative'>
            <div className='h-1 bg-secondary' />
            <div className='absolute cursor-default -top-0.5 right-[calc(50%-68px)] bg-secondary py-0.5 px-10 rounded-b-md text-xs scale-75'>
              TESTNET
            </div>
          </div>
        )}
        {!hideMenu && (
          <HeaderWithMenu goBack={(canGoBackRef.current) ? goBack : undefined} />
        )}
        <div className='w-full h-full px-6 pb-6 flex flex-col justify-between'>
          {children}
        </div>
        <div id='widget_root' />
      </div>
    </div>
  )
}

Widget.Content = Content
Widget.Footer = Footer

export default Widget
