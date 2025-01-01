import { type PropsWithChildren } from 'react'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from '@hanzo/ui/primitives-common'

import { formatToMaxChar } from '@hanzo/ui/util'

const TooltipHelper: React.FC<{
  text: string
  tooltipClx?: string
} & PropsWithChildren> = ({
  children,
  text,
  tooltipClx=''
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent className={tooltipClx}>
        {text}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

const AmountAvailable: React.FC<{
  amount: number
  maxChars: number
  fromAssetName: string
}> = ({
  amount,
  maxChars,
  fromAssetName
}) => {
  
  const { result: formatted, change } = formatToMaxChar(amount, maxChars)

  return (
    <span className='block shrink-0 cursor-default'>
    {change === 'rounded' ? (
      <TooltipHelper text={`${amount} ${fromAssetName}`} tooltipClx='text-foreground'>
        <span>~{formatted}&nbsp;{fromAssetName}&nbsp;avail</span>
      </TooltipHelper>
    ) : (
      <span>{amount}&nbsp;{fromAssetName}&nbsp;avail</span>  
    )}
    </span>
  )
}

export default AmountAvailable
