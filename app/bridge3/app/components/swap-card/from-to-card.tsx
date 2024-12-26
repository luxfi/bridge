import { observer } from 'mobx-react-lite'

import NetworkCombobox from '../network-combobox'
import ReverseButton from './reverse-button'
import { useSwapState } from '@/contexts/swap-state'

const ABS_CENTERED = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%,-50%)'
} satisfies React.CSSProperties

const FromToCard: React.FC<{
  className?: string
}> = observer(({
  className=''
}) => {

  const swapState = useSwapState()
  /* TODO
  const swapFromAndTo = () => {
    const tmp = swapState.from
    swapState.setFrom(swapState.to)
    swapState.setTo(tmp)

    const tmpNetworks = swapState.fromNetworks
    swapState.setFromNetworks(swapState.toNetworks)
    swapState.setToNetworks(tmpNetworks)
  }
  */

    // 'flex w-full gap-2 relative'
  return (
    <div className={className}>
      <NetworkCombobox
        networks={swapState.fromNetworks}
        setNetwork={swapState.setFrom}
        network={swapState.from}
        buttonClx='grow pr-4'
        popoverClx='w-[350px]'
        popoverAlign='start'
        label='from'
      />
      <NetworkCombobox
        networks={swapState.toNetworks}
        setNetwork={swapState.setTo}
        network={swapState.to}
        buttonClx='grow pl-4'
        popoverClx='w-[350px]'
        popoverAlign='end'
        label='to'
        rightJustified
      />
      <ReverseButton 
        className='p-1 h-auto text-muted active:!bg-level-3' 
        onClick={() => {}} 
        style={ABS_CENTERED}
      />
    </div>
  )
})

export default FromToCard
