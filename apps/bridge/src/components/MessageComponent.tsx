import type { PropsWithChildren } from "react"
import CancelIcon from "./icons/CancelIcon";
import DelayIcon from "./icons/DelayIcon";
import FailIcon from "./icons/FailIcon";
import SuccessIcon from "./icons/SuccessIcon";
type iconStyle = 'red' | 'green' | 'yellow' | 'gray'

interface MessageComponentProps extends PropsWithChildren {
  center?: boolean
  icon: iconStyle
} 

function constructIcons(icon: iconStyle) {

    let iconStyle: JSX.Element

    switch (icon) {
        case 'red':
            iconStyle = <FailIcon />;
            break;
        case 'green':
            iconStyle = <SuccessIcon />;
            break;
        case 'yellow':
            iconStyle = <DelayIcon />
            break
        case 'gray':
            iconStyle = CancelIcon
            break
    }
    return iconStyle
}

  // must use function syntax
function MessageComponent({ children } : PropsWithChildren) {
  return (
    <div className="w-full flex flex-col h-full justify-between pt-6 min-h-full">
      {children}
    </div>    
  ) 
}

const Content: React.FC<MessageComponentProps>  = ({ 
  children, 
  icon, 
  center 
}) => (center ? (
    <div className='flex flex-col self-center grow w-full'>
        <div className='flex self-center grow w-full'>
            <div className='flex flex-col space-y-8 self-center w-full'>
                <div className='flex place-content-center'>{constructIcons(icon)}</div>
                {children}
            </div>
        </div>
    </div>
  ) : (
    <div className='space-y-3'>
        <div className='flex place-content-center'>{constructIcons(icon)}</div>
        {children}
    </div>
  )
)

const Header: React.FC<PropsWithChildren> = ({ children }) => {
    return <div className='md:text-3xl text-lg font-bold  leading-6 text-center'>
        {children}
    </div>
}

const Description: React.FC<PropsWithChildren>  = ({ children }) => (
  <div className="text-base font-medium space-y-6  text-center mb-6">
      {children}
  </div>
)

const Buttons: React.FC<PropsWithChildren>  = ({ children }) => (
  <div className="flex flex-row justify-center">
      {children}
  </div>
)

MessageComponent.Content = Content
MessageComponent.Header = Header
MessageComponent.Description = Description
MessageComponent.Buttons = Buttons

export default MessageComponent


