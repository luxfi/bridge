import type { FC, MouseEventHandler } from 'react'

type buttonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SecondaryButton: FC<{
  size?: buttonSize
  onClick?: MouseEventHandler<HTMLButtonElement>
  className?: string
  disabled?: boolean
  children?: React.ReactNode
}> = ({ 
  size = 'md', 
  onClick, 
  children, 
  className, 
  disabled 
}) => {

  let defaultStyle = 'rounded-md duration-200 break-keep transition bg-level-2 hover:bg-level-3' +
    ' font-semibold text-foreground shadow-sm cursor-pointer ' + 
      className

  switch (size) {
    case 'xs':
      defaultStyle += ' px-2 py-1 text-xs'
      break
    case 'sm':
      defaultStyle += ' px-2 py-1 text-sm'
      break
    case 'md':
      defaultStyle += ' px-2.5 py-1.5 text-sm'
      break
    case 'lg':
      defaultStyle += ' px-3 py-2 text-sm'
      break
    case 'xl':
      defaultStyle += ' px-3.5 py-2.5 text-sm'
      break
  }

  return (
    <button
      type='button'
      className={defaultStyle}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default SecondaryButton
