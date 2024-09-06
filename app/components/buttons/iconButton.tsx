import React, { ComponentProps, FC, forwardRef } from 'react'
import { cn } from '@luxdefi/ui/util'

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'color' | 'ref'> {
    icon?: React.ReactNode
}

const IconButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, IconButtonProps>(
  ({ className, icon, ...props }, ref) => (
    <button {...props} type="button" className={cn(
      "py-1.5 justify-self-start hover:bg-level-1 hover:text-accent focus:outline-none inline-flex rounded-lg items-center", 
      className
    )}>
      <div className='mx-2'>
        {icon}
      </div>
      <span className="sr-only">Icon description</span>
    </button>
  )
)

export default IconButton
