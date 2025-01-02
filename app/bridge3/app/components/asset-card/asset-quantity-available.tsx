import { type PropsWithChildren } from 'react'
import { TooltipWrapper } from '@hanzo/ui/primitives-common'

import { formatToMaxChar } from '@hanzo/ui/util'


const AssetQuantityAvailable: React.FC<{
  quantity: number
  maxChars: number
  fromAssetName: string
}> = ({
  quantity,
  maxChars,
  fromAssetName
}) => {
  
  const { result: formatted, change } = formatToMaxChar(quantity, maxChars)

  return (
    <span className='block shrink-0 cursor-default'>
    {change === 'rounded' ? (
      <TooltipWrapper text={`${quantity} ${fromAssetName}`} tooltipClx='text-foreground'>
        <span>~{formatted}&nbsp;{fromAssetName}&nbsp;avail</span>
      </TooltipWrapper>
    ) : (
      <span>{quantity}&nbsp;{fromAssetName}&nbsp;avail</span>  
    )}
    </span>
  )
}

export default AssetQuantityAvailable
