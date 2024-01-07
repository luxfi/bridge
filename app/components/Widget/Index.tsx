import { PropsWithChildren, useCallback, useRef } from "react"
import HeaderWithMenu from "../HeaderWithMenu"
import { useRouter } from "next/router"
import { default as Content } from './Content';
import { default as Footer } from './Footer';
import { resolvePersistantQueryParams } from "../../helpers/querryHelper"
import BridgeApiClient from "../../lib/BridgeApiClient"

type Props = {
  className?: string
  hideMenu?: boolean
}

  // Don't use FC
const Widget = ({ children, className, hideMenu }: Props & PropsWithChildren) => {
  
  const router = useRouter()
  const wrapper = useRef(null);

  const goBack = useCallback(() => {
    window.history?.length > 2 ?
        router.back()
        : router.push({
          pathname: "/",
          query: resolvePersistantQueryParams(router.query)
        })
  }, [])

  const handleBack = router.pathname === "/" ? null : goBack

  return (
    <div className='bg-level-1 rounded-lg w-full sm:overflow-hidden relative'>
      <div className="relative z-20">
        {
            BridgeApiClient.apiVersion === 'sandbox' && <div>
              <div className="h-0.5 bg-[#D95E1B]" />
              <div className="absolute -top-0.5 right-[calc(50%-68px)] bg-[#D95E1B] py-0.5 px-10 rounded-b-md text-xs scale-75">
                  TESTNET
              </div>
            </div>
        }
      </div>
      {!hideMenu && <HeaderWithMenu goBack={handleBack} />}
      <div className="relative px-6">
        <div className="flex items-start" ref={wrapper}>
          <div className='flex flex-nowrap grow'>
            <div className='w-full pb-6 flex flex-col justify-between space-y-5 text-foreground h-full ${className}'>
              {children}
            </div>
          </div>
        </div>
      </div>
      <div id="widget_root" />
    </div>
  )
}

Widget.Content = Content
Widget.Footer = Footer

export { Widget }