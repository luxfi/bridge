'use client'
import { type PropsWithChildren } from "react"
import { renderToString } from 'react-dom/server'

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@hanzo/ui/primitives'


import { Paperclip } from 'lucide-react'

import { Logo } from '@luxfi/ui'

import CopyButton from "../buttons/copyButton";
import BridgeLogo from "../icons/BridgeLogo";
import BridgeLogoSmall from "../icons/BridgeLogoSmall";
import { useGoHome } from "../../hooks/useGoHome";

const GoHomeButton: React.FC<{
  className?: string
} & PropsWithChildren> = (({ 
  className, 
  children 
}) => {

  const goHome = useGoHome()

  return (
    <div onClick={goHome}>
    {children ?? (
      <ContextMenu>
        <ContextMenuTrigger>
          <Logo size='md' outerClx={className}/>
        </ContextMenuTrigger>
        <ContextMenuContent className="dialog-overlay absolute z-40 border h-fit text-muted border-[#404040] mt-2 w-fit rounded-md shadow-lg bg-level-1 focus:outline-none">
          <ContextMenuItem className="dialog-content px-4 py-2 text-sm text-left w-full rounded-t hover:bg-level-2 whitespace-nowrap">
            <CopyButton toCopy={renderToString(<BridgeLogo />)}>Copy logo as SVG</CopyButton>
          </ContextMenuItem >
          <ContextMenuItem className="dialog-content px-4 py-2 text-sm text-left w-full hover:bg-level-2 whitespace-nowrap">
            <CopyButton toCopy={renderToString(<BridgeLogoSmall />)}>Copy symbol as SVG</CopyButton>
          </ContextMenuItem >
          <ContextMenuItem className="dialog-content">
            <a href="" target='_blank' className='flex space-x-1 items-center px-4 py-2 rounded-b text-sm text-left w-full hover:bg-level-2 whitespace-nowrap'>
              <Paperclip width={16} />
              <p>Brand Guidelines</p>
            </a>
          </ContextMenuItem >
        </ContextMenuContent>
      </ContextMenu>
    )}
  </div>
  )
})

export default GoHomeButton;
