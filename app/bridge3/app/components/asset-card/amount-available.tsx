import { type PropsWithChildren } from 'react'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from '@hanzo/ui/primitives-common'

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

const formatAvailable = (v: number | null): string => {
  if (!v) return ''
  let str = v.toFixed(5)
  if (v - parseFloat(str) !== 0) {
    str = '~' + str 
  }
  return str
}

const AmountAvailable: React.FC<{
  amount?: number
  fromAssetName: string
}> = ({
  amount,
  fromAssetName
}) => {
  
  const formattedAmount = formatAvailable(amount ?? null)
  const availableWasRounded = formattedAmount?.startsWith('~')
  
  return (
    <span className='block shrink-0 cursor-default'>
    {availableWasRounded ? (
      <TooltipHelper text={`${amount} ${fromAssetName}`} tooltipClx='text-foreground'>
          <span>{formattedAmount}&nbsp;{fromAssetName}&nbsp;avail</span>
      </TooltipHelper>
    ) : (<>
      <span>{formattedAmount}&nbsp;{fromAssetName}&nbsp;avail</span>  
    </>)}
    </span>
  )
}

export default AmountAvailable
