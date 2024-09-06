import { FC, MouseEventHandler, PropsWithChildren } from "react"
import SpinIcon from "../icons/spinIcon"
import { cn } from '@luxdefi/ui/util'

type buttonStyle = 'outline' | 'filled';
type buttonSize = 'small' | 'medium' | 'large';
type text_align = 'center' | 'left'
type button_align = 'left' | 'right'

function constructClassNames(size: buttonSize, buttonStyle: buttonStyle) {
  let defaultStyle = ' border border-muted-3 disabled:border-[#404040] items-center space-x-1 ' + 
    'disabled:opacity-80 disabled:cursor-not-allowed ' + 
    'relative w-full ' + 
    'flex justify-center ' + 
    'font-semibold rounded-md transform transition duration-200 ease-in-out'
  defaultStyle += buttonStyle == 'filled' ? " hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux" : " text-muted-3";

  switch (size) {
    case 'large':
      defaultStyle += " py-4 px-4";
      break;
    case 'medium':
      defaultStyle += " py-3 px-2 md:px-3";
      break;
    case 'small':
      defaultStyle += " py-1.5 px-1.5";
      break;
  }

  return defaultStyle + ' '
}

const SubmitButton: FC<{
  isDisabled: boolean
  isSubmitting: boolean
  type?: 'submit' | 'reset' | 'button'
  onClick?: MouseEventHandler<HTMLButtonElement>
  icon?: React.ReactNode
  buttonStyle?: buttonStyle
  size?: buttonSize
  text_align?: text_align
  button_align?: button_align
  className?: string
} & PropsWithChildren> = ({
  isDisabled,
  isSubmitting,
  icon,
  children,
  type,
  onClick,
  buttonStyle = 'filled',
  size = 'medium',
  text_align = 'center',
  button_align = 'left',
  className=''
}) => (
  <button
    disabled={isDisabled || isSubmitting}
    type={type}
    onClick={onClick}
    className={cn(constructClassNames(size, buttonStyle), className)}
  >
    <span className={(button_align === "right" ? 'order-last ' : 'order-first ') + (text_align === 'center' ? "absolute left-0 inset-y-0 flex items-center pl-3" : "relative")}>
      {(!isDisabled && !isSubmitting) && icon}
      {isSubmitting && (
        <SpinIcon className="animate-spin h-5 w-5" />
      )}
    </span>
    <span className={'grow ' + (text_align === 'left' ? 'text-left' : 'text-center')}>{children}</span>
  </button>
)

const text_styles = {
  'mltln-text-light': {
    primary: 'text-gray-900',
    secondary: 'text-gray-100'
  },
  'mltln-text-dark': {
    primary: 'text-gray-900',
    secondary: 'text-gray-100'
  }
}

export const DoubleLineText: React.FC<{
  primaryText: string,
  secondarytext: string,
  colorStyle: 'mltln-text-light' | 'mltln-text-dark',
  reversed?: boolean
}> = ({
  primaryText,
  secondarytext,
  colorStyle,
  reversed
}) => (
  <div className={`leading-3 flex ${reversed ? 'flex-col-reverse' : 'flex-col'}`}>
    <div className={`text-xs ${text_styles[colorStyle].secondary}`}>{secondarytext}</div>
    <div className={`${text_styles[colorStyle].primary}`}>{primaryText}</div>
  </div>
)

export default SubmitButton;
