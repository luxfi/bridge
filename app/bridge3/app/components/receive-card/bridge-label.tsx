import { cn } from '@hanzo/ui/util'

import { type Bridge } from '@/domain/types'

const BridgeLabel: React.FC<{
  bridge: Bridge
  imageSize?: number
  imageClx?: string
  className?: string
}> = ({
  bridge : { name, logo },
  imageSize=24,
  imageClx='',
  className=''
}) => (
  <div className={cn('flex justify-start items-center gap-2', className)}>
    <img
      src={logo}
      alt={name + ' image'}
      height={imageSize}
      width={imageSize}
      loading="eager"
      className={cn('block', imageClx)}
    />
    <span className='block'>{name}</span>
  </div>
)

export default BridgeLabel
