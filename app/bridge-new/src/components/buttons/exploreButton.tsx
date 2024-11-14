import { type AnchorHTMLAttributes, forwardRef } from 'react'
import {  ExternalLink } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui/primitives'

import { classNames } from '../utils/classNames'

interface ExploreButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  className?: string
  children?: React.ReactNode
  iconSize?: number
  iconClassName?: string
}

const ExploreButton: React.FC<ExploreButtonProps> = forwardRef<HTMLAnchorElement, ExploreButtonProps>(function co({ className, children, iconSize, iconClassName, ...rest }, ref) {

  return (
      <Tooltip>
        <TooltipTrigger>
          <div className={classNames(className)}>
              <a {...rest} className="flex items-center gap-1 cursor-pointer">
                <ExternalLink className={iconClassName} width={iconSize ? iconSize : 16} height={iconSize ? iconSize : 16} />
                {children}
              </a>
          </div>
        </TooltipTrigger>
          <TooltipContent>
            <p>View in explorer</p>
          </TooltipContent>
      </Tooltip>
  );
})

export default ExploreButton