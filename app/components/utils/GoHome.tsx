// @ts-nocheck
import { FC } from "react";

import { renderToString } from 'react-dom/server'

import { Paperclip } from 'lucide-react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';

import { Logo } from '@luxdefi/ui/common'

import CopyButton from "../buttons/copyButton";
import BridgeLogo from "../icons/BridgeLogo";
import BridgeLogoSmall from "../icons/BridgeLogoSmall";
import { useGoHome } from "../../hooks/useGoHome";


interface Props {
    className?: string;
    children?: JSX.Element | JSX.Element[] | string;
}

const GoHomeButton: FC<Props> = (({ className, children }) => {
    const goHome = useGoHome()

    return (
        <div onClick={goHome}>
            {
                children ??
                <>
                    <ContextMenuPrimitive.Root>
                        <ContextMenuPrimitive.Trigger>
                          <Logo className={className ?? "h-8 w-auto"} />
                        </ContextMenuPrimitive.Trigger>
                        <ContextMenuPrimitive.Content className="dialog-overlay absolute z-40 border h-fit text-foreground text-foreground-new border-level-3 mt-2 w-fit rounded-md shadow-lg bg-level-1 darkest-class ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <ContextMenuPrimitive.ContextMenuItem className="dialog-content px-4 py-2 text-sm text-left w-full rounded-t hover:bg-level-2 whitespace-nowrap">
                                <CopyButton toCopy={renderToString(<BridgeLogo />)}>Copy logo as SVG</CopyButton>
                            </ContextMenuPrimitive.ContextMenuItem >
                            <ContextMenuPrimitive.ContextMenuItem className="dialog-content px-4 py-2 text-sm text-left w-full hover:bg-level-2 whitespace-nowrap">
                                <CopyButton toCopy={renderToString(<BridgeLogoSmall />)}>Copy symbol as SVG</CopyButton>
                            </ContextMenuPrimitive.ContextMenuItem >
                            <hr className="horizontal-gradient" />
                            <ContextMenuPrimitive.ContextMenuItem className="dialog-content">
                                <a href="https://bridge.notion.site/bridge/Bridge-brand-guide-4b579a04a4c3477cad1c28f466749cf1" target='_blank' className='flex space-x-1 items-center px-4 py-2 rounded-b text-sm text-left w-full hover:bg-level-3 whitespace-nowrap'>
                                    <Paperclip width={16} />
                                    <p>Brand Guidelines</p>
                                </a>
                            </ContextMenuPrimitive.ContextMenuItem >
                        </ContextMenuPrimitive.Content>
                    </ContextMenuPrimitive.Root>
                </>
            }
        </div>
    )
})

export default GoHomeButton;
