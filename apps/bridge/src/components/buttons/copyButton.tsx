'use client'

import { Check, Copy } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui/primitives'


import { classNames } from '../utils/classNames'
import useCopyClipboard from '../../hooks/useCopyClipboard'

interface CopyButtonProps {
  className?: string
  toCopy: string | number
  children?: React.ReactNode
  iconSize?: number
  iconClassName?: string
}

const CopyButton: React.FC<CopyButtonProps> = ({ className, toCopy, children, iconSize, iconClassName }) => {
  const [isCopied, setCopied] = useCopyClipboard()

  return (
      <Tooltip open={false}>
        <TooltipTrigger>
          <div className={classNames(className)} onClick={() => setCopied(toCopy)}>
            {isCopied && (
              <div className="flex items-center gap-1 cursor-pointer">
                <Check className={iconClassName} width={iconSize ? iconSize : 16} height={iconSize ? iconSize : 16} />
                {children}
              </div>
            )}

            {!isCopied && (
              <div className="flex items-center gap-1 cursor-pointer">
                <Copy className={iconClassName} width={iconSize ? iconSize : 16} height={iconSize ? iconSize : 16} />
                {children}
              </div>
            )}
          </div>
        </TooltipTrigger>
          <TooltipContent>
            <p>Copy</p>
          </TooltipContent>
      </Tooltip>
  )
}

export default CopyButton