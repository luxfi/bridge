import { cn } from '@hanzo/ui/util'
import type { PropsWithChildren } from 'react'

const Content: React.FC<{
  className?: string
} & PropsWithChildren> = ({ 
  children, 
  className=''
}) => (
  <div className={cn('flex flex-col justify-center items-center grow w-full', className)}>
    {children}
  </div>
)

export default Content