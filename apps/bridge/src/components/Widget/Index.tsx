'use client'
import { useCallback, useRef, type PropsWithChildren } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import HeaderWithMenu from '../HeaderWithMenu'
import Content  from './Content'
import Footer from './Footer'
import resolvePersistantQueryParams from '@/util/resolvePersisitentQueryParams'
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
  const wrapper = useRef(null)

  const searchParams = useSearchParams()
  const paramString = resolvePersistantQueryParams(searchParams)

    // https://stackoverflow.com/questions/71853839/how-to-check-if-userouter-can-use-router-back-in-nextjs-app
  const goBack = useCallback(() => {
    if (window.history?.length && window.history.length > 1) {
      router.back()
    }
    else {
      router.push('/' + (paramString ? ('?' + paramString) : '' )) 
    }
  }, [paramString])


  const sandbox = BridgeApiClient.apiVersion === 'sandbox'

  return (
    <div className='rounded-lg w-full sm:overflow-hidden relative border border-[#404040]'>
      {sandbox && (
        <div className='relative z-20 pb-2'>
          <div className='h-1 bg-secondary' />
          <div className='absolute cursor-default -top-0.5 right-[calc(50%-68px)] bg-secondary  py-0.5 px-10 rounded-b-md text-xs scale-75'>
            TESTNET
          </div>
        </div>
      )}
      {!hideMenu && (
        <HeaderWithMenu goBack={goBack} />
      )}
      <div className='relative px-6'>
        <div className='flex items-start' ref={wrapper}>
          <div className='flex flex-nowrap grow'>
            <div className={'w-full pb-6 flex flex-col justify-between space-y-1 h-full ' + className}>
              {children}
            </div>
          </div>
        </div>
      </div>
      <div id='widget_root' />
    </div>
  )
}

Widget.Content = Content
Widget.Footer = Footer

export default Widget 
