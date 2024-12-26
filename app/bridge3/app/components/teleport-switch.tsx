import { observer } from 'mobx-react-lite'

import { Switch, Label } from '@hanzo/ui/primitives-common'

import { useSwapState } from '@/contexts/swap-state'
import { cn } from '@hanzo/ui/util'

const TeleportSwitch: React.FC<{
  outerClx?: string
  switchClx?: string
  thumbClx?: string
  labelClx?: string
}> = observer(({
  outerClx='',
  switchClx='',
  thumbClx='',  
  labelClx='',
}) => {

  const swapState = useSwapState()

  return (
    <div className={cn('flex items-center gap-2', outerClx)}>
      <Switch
        id='teleport-switch' 
        className={switchClx} 
        thumbClx={thumbClx}
        checked={swapState.teleport} 
        onCheckedChange={swapState.setTeleport}
      />
      <Label htmlFor='teleport-switch' className={cn('text-muted', labelClx)}>teleport</Label>
    </div>
  )
})

export default TeleportSwitch
