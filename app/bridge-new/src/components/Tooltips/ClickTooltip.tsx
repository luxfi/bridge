import React, { type PropsWithChildren } from 'react'
import { Info } from 'lucide-react'
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger,
} from '@hanzo/ui/primitives'


const ClickTooltip: React.FC<{
  text: string | React.ReactNode
} & PropsWithChildren> = ({  
  children,
  text 
}) => (
  <Popover>
    <PopoverTrigger>
      <Info className="h-4 " aria-hidden="true" strokeWidth={2.5} />
    </PopoverTrigger>
    <PopoverContent className='text-sm'>{text}{children}</PopoverContent>
  </Popover>
)

export default ClickTooltip