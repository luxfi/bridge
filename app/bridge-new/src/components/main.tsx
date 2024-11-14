import type { PropsWithChildren } from 'react'

import { cn } from '@hanzo/ui/util'

import MaintananceContent from './maintanance/maintanance'
import Toaster from './toaster'

const Main: React.FC<{
  className?: string
} & PropsWithChildren> = ({ 
  className='',
  children 
}) => (
  <main className={cn('flex flex-col items-center overflow-hidden relative mt-[44px] md:mt-[80px]', className)}>
    <Toaster />
    {process.env.NEXT_PUBLIC_IN_MAINTANANCE === 'true' ? (
      <MaintananceContent />
    ) : (
      children
    )}
    <div id='offset-for-stickyness' className='block md:hidden'></div>
  </main>
)

export default Main
