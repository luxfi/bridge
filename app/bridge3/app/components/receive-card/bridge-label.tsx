import { observer } from 'mobx-react-lite'
import { cn } from '@hanzo/ui/util'

import { useSwapState } from '@/contexts/swap-state'

const BridgeLabel: React.FC<{
  imageSize?: number
  imageClx?: string
  className?: string
}> = observer(({
  imageSize=24,
  imageClx='',
  className=''
}) => {
  const swapState = useSwapState()
  const imageUrl =  swapState.toNetwork?.logo ?? swapState.toNetwork?.img_url ?? null

  return imageUrl ? (
    <div className={cn('flex justify-start items-center gap-2', className)}>
      <img
        src={imageUrl}
        alt={swapState.toNetwork?.display_name + ' image'}
        height={imageSize}
        width={imageSize}
        loading="eager"
        className={cn('block', imageClx)}
      />
      <span className='block'>{swapState.bridge}</span>
    </div>
  ) : null
})

export default BridgeLabel
