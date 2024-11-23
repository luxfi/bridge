import type { PropsWithChildren, ReactNode } from "react"

import { ChevronRight, ExternalLink } from "lucide-react"

import LinkWrapper from "../LinkWrapper"
import { cn } from '@hanzo/ui/util'

function Menu ({ children }: PropsWithChildren)  {
  return (
    <div className="flex flex-col gap-3 mt-3">
      {children}
      <div style={{ height: '70px' }} />
    </div>
  )
}

const Group: React.FC<PropsWithChildren> = ({ children }) => (
  <div className="divide-y divide-muted-3 rounded-md overflow-hidden bg-level-1">
    {children}
  </div>
)

const itemClass = 'flex justify-between cursor-pointer hover:bg-level-2 select-none w-full px-4 py-3 outline-none text-muted'

const Item: React.FC<{
  pathname?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  icon: ReactNode
  target?: '_blank' | '_self'
} & PropsWithChildren> = ({ 
  children, 
  pathname, 
  onClick, 
  icon, 
  target = '_self' 
}) => (

  pathname ? (
    <LinkWrapper 
      href={pathname} 
      target={target} 
      className={itemClass}
    >
      <div className="flex justify-start">
          {icon}
          <span className="pl-2">{children}</span>
      </div>
    {target === '_self' ?
      ( <ChevronRight className="h-5 w-5" /> )
      :
      ( <ExternalLink className="h-5 w-5" /> )
    }
    </LinkWrapper>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={itemClass}
    >
      <div className="flex justify-start">
        {icon}
        <span className="pl-2">{children}</span>
      </div>
      <ChevronRight className="h-5 w-5" />
    </button>
  )
)

const Footer: React.FC<{
  className?: string
} & PropsWithChildren> = ({ 
  className='',
  children 
}) => (
  <div className={cn(
    'text-muted bg-background text-base ', 
    'sticky inset-x-0 bottom-0 ',
    'w-full ',
    'flex justify-center',
    className
  )}>
    {children}
  </div>
)

Menu.Group = Group
Menu.Item = Item
Menu.Footer = Footer

export default Menu