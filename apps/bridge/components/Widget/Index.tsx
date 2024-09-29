'use client'
import HeaderWithMenu from "../HeaderWithMenu"
import { useRouter } from "next/router"
import { default as Content } from './Content';
import { default as Footer } from './Footer';
import { useCallback, useRef } from "react";
import { resolvePersistantQueryParams } from "../../helpers/querryHelper";
import BridgeApiClient from "../../lib/BridgeApiClient";

type Props = {
  children: JSX.Element | JSX.Element[];
  className?: string;
  hideMenu?: boolean;
}

const Widget = ({ children, className, hideMenu }: Props) => {

  const router = useRouter()
  const wrapper = useRef(null);

  const goBack = useCallback(() => {
    window?.['navigation']?.['canGoBack'] ?
      router.back()
      : router.push({
        pathname: "/",
        query: resolvePersistantQueryParams(router.query)
      })
  }, [])


  const handleBack = (router.pathname === "/") ? null : goBack

  const sandbox = BridgeApiClient.apiVersion === 'sandbox'

  return <>
    <div className='rounded-lg w-full sm:overflow-hidden relative border border-[#404040]'>
      {sandbox && (
        <div className="relative z-20 pb-2">
          <div className="h-1 bg-secondary" />
          <div className="absolute cursor-default -top-0.5 right-[calc(50%-68px)] bg-secondary  py-0.5 px-10 rounded-b-md text-xs scale-75">
            TESTNET
          </div>
        </div>
      )}
      {!hideMenu && (
        <HeaderWithMenu goBack={handleBack} />
      )}
      <div className="relative px-6">
        <div className="flex items-start" ref={wrapper}>
          <div className='flex flex-nowrap grow'>
            <div className={'w-full pb-6 flex flex-col justify-between space-y-1 h-full' + className ?? ''}>
              {children}
            </div>
          </div>
        </div>
      </div>
      <div id="widget_root" />
    </div>
  </>
}

Widget.Content = Content
Widget.Footer = Footer

export { Widget }