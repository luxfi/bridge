import { ChevronRight, ExternalLink } from "lucide-react"
import LinkWrapper from "../LinkWrapper"
import { PropsWithChildren, ReactNode } from "react"

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

const Footer: React.FC<PropsWithChildren> = ({ children }) => (
  <div className={
      'text-muted bg-background text-base border-t border-[#404040] ' + 
    'sticky inset-x-0 bottom-0 z-30 ' + 
    'shadow-widget-footer px-6 pt-4 w-full ' +
    'flex flex-row justify-center'
}>
    {children}
  </div>
)

Menu.Group = Group
Menu.Item = Item
Menu.Footer = Footer

export default Menu