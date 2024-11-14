import { Home, RefreshCcw } from "lucide-react";

import { Button } from '@hanzo/ui/primitives'

import ContactSupport from "./ContactSupport"
import MessageComponent from "./MessageComponent"
import Main from './main'
import { useGoHome } from "@/hooks/useGoHome"

export default function ErrorFallback({ error, resetErrorBoundary }: {error: any, resetErrorBoundary: () => void}) {

  const extension_error = error.stack?.includes?.("chrome-extension", "app://")

  const goHome = useGoHome()

  return (
    <Main className='mb-20'>
      <MessageComponent>
        <MessageComponent.Content icon="red">
          <MessageComponent.Header>
              Unable to complete the request
          </MessageComponent.Header>
          <MessageComponent.Description className='max-w-lg flex flex-col justify-between items-center mt-4'>
            <p className='text-center'>
              <span>Sorry, but we were unable to complete this request.&nbsp;</span>
              {extension_error ?
                <span>It seems that some of your extensions are preventing the app from running.</span>
                : 
                <span>Are team as been informed, and will investigate the issue.</span>
              }
            </p>
            <p  className='text-center'>
              {extension_error ?
                <span>Please disable extensions and try again or open in incognito mode. If the issue keeps happening,&nbsp;</span>
                :
                <span>Please try again. If the issue keeps happening,&nbsp;</span>
              }
              <span className="underline cursor-pointer "><ContactSupport>contact our support team.</ContactSupport></span>
            </p>
          </MessageComponent.Description>
        </MessageComponent.Content>
        <MessageComponent.Buttons className="flex flex-row gap-4">
          <Button 
            className="flex gap-2" 
            variant="outline" 
            onClick={goHome}
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            <span>Go home</span>
          </Button>
          <Button 
            className="flex gap-2" 
            variant='primary'
            onClick={resetErrorBoundary}
          >
            <RefreshCcw className="h-5 w-5" aria-hidden="true" />
            <span>Try Again</span>
          </Button>
        </MessageComponent.Buttons>
      </MessageComponent>
      <div id="modal_portal_root" />
    </Main>
  )
}

