'use client'
import { FC, PropsWithChildren } from "react"
import { renderToString } from 'react-dom/server'

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { Paperclip } from 'lucide-react'

import { Logo } from '@luxdefi/ui/common'

import CopyButton from "../buttons/copyButton";
import BridgeLogo from "../icons/BridgeLogo";
import BridgeLogoSmall from "../icons/BridgeLogoSmall";
import { useGoHome } from "../../hooks/useGoHome";

const GoHomeButton: FC<{
  className?: string
} & PropsWithChildren> = (({ 
  className, 
  children 
}) => {

  const goHome = useGoHome()

  return (
    <div onClick={goHome}>
    {children ?? (
      <ContextMenuPrimitive.Root>
        <ContextMenuPrimitive.Trigger>
          <Logo size='md' className="text-primary"/>
        </ContextMenuPrimitive.Trigger>
        <ContextMenuPrimitive.Content className="dialog-overlay absolute z-40 border h-fit text-muted border-[#404040] mt-2 w-fit rounded-md shadow-lg bg-level-1 focus:outline-none">
          <ContextMenuPrimitive.ContextMenuItem className="dialog-content px-4 py-2 text-sm text-left w-full rounded-t hover:bg-level-2 whitespace-nowrap">
            <CopyButton toCopy={renderToString(<BridgeLogo />)}>Copy logo as SVG</CopyButton>
          </ContextMenuPrimitive.ContextMenuItem >
          <ContextMenuPrimitive.ContextMenuItem className="dialog-content px-4 py-2 text-sm text-left w-full hover:bg-level-2 whitespace-nowrap">
            <CopyButton toCopy={renderToString(<BridgeLogoSmall />)}>Copy symbol as SVG</CopyButton>
          </ContextMenuPrimitive.ContextMenuItem >
          <ContextMenuPrimitive.ContextMenuItem className="dialog-content">
            <a href="" target='_blank' className='flex space-x-1 items-center px-4 py-2 rounded-b text-sm text-left w-full hover:bg-level-2 whitespace-nowrap'>
              <Paperclip width={16} />
              <p>Brand Guidelines</p>
            </a>
          </ContextMenuPrimitive.ContextMenuItem >
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Root>
    )}
  </div>
  )
})

export default GoHomeButton;
