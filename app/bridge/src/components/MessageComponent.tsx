import type { PropsWithChildren } from "react"

import { cn } from '@hanzo/ui/util'

import CancelIcon from "./icons/CancelIcon";
import DelayIcon from "./icons/DelayIcon";
import FailIcon from "./icons/FailIcon";
import SuccessIcon from "./icons/SuccessIcon";
import type React from 'react'

type IconType = 'red' | 'green' | 'yellow' | 'gray'

const MessageIcon: React.FC<{
  icon: IconType
  className?: string
}> = ({
  icon, 
  className=''  
}) => {

  switch (icon) {
    case 'red':
      return <FailIcon className={className}/>
    case 'green':
      return <SuccessIcon  className={className}/>
    case 'yellow':
      return <DelayIcon  className={className}/>
    case 'gray':
      return <CancelIcon className={className}/>
  }
  return <></>
}

  // must use function syntax
function MessageComponent({ 
  children, 
  className='' 
} : {
  className?: string 
} & PropsWithChildren) {
  return (
    <div className={cn(
      "flex flex-col justify-between items-center pt-6 w-full h-full min-h-full", 
      className
    )}>
      {children}
    </div>    
  ) 
}

const Content: React.FC<{
  icon: IconType
  className?: string
} & PropsWithChildren>  = ({ 
  children, 
  icon, 
  className='' 
}) => (
  <div className={cn('flex flex-col justify-between items-center ', className )}>
    <MessageIcon icon={icon}/>
    {children}
  </div>
)

const Header: React.FC<{ 
  className?: string 
} & PropsWithChildren> = ({ 
  children, 
  className='' 
}) => (
  <div className={cn('md:text-3xl text-lg font-bold leading-6', className )}>
    {children}
  </div>
)

const Description: React.FC<{ 
  className?: string 
} & PropsWithChildren> = ({ 
  children, 
  className='' 
}) => (
  <div className={cn("text-base font-medium space-y-6 mb-6", className )}>
      {children}
  </div>
)

const Buttons: React.FC<{ 
  className?: string 
} & PropsWithChildren> = ({ 
  children, 
  className='' 
}) => (

  <div className={cn('', className )}>
      {children}
  </div>
)

MessageComponent.Content = Content
MessageComponent.Header = Header
MessageComponent.Description = Description
MessageComponent.Buttons = Buttons

export default MessageComponent


