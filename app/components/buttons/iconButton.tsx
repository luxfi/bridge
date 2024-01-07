import React, { ComponentProps, FC, forwardRef } from 'react'
import { classNames } from '../utils/classNames'

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'color' | 'ref'> {
    icon?: React.ReactNode
}

const IconButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, IconButtonProps>(function IconButton({ className, icon, ...props }, ref){
    const theirProps = props as object;

    return (
        <button {...theirProps} type="button" className={classNames("-mx-2 py-1.5 justify-self-start text-foreground text-foreground-new hover:bg-level-4 darker-hover-class hover:text-muted text-muted-primary-text focus:outline-none inline-flex rounded-lg items-center", className)}>
            <div className='mx-2'>
                <div>
                    {icon}
                </div>
            </div>

            <span className="sr-only">Icon description</span>
        </button>
    )
})

export default IconButton