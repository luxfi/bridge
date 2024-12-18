import React, { useRef, useState } from 'react'

import type { Network, Token } from '@/domain/types'

// import DecimalInput from './decimal-input'
import TokenCard from '../token-card'
import FromToCard from './from-to-card'
import { cn } from '@hanzo/ui/util'

const SwapCard: React.FC<{
  className?: string
  fromNetworks: Network[]
  fromInitial?: Network | null
  toNetworks: Network[]
  toInitial?: Network | null
}> = ({
  className='',
  fromNetworks,
  fromInitial,
  toNetworks,
  toInitial,
}) => {

  const _from = useRef<Network | null>(fromInitial ?? null)
  const _to = useRef<Network | null>(toInitial ?? null)
  const _fromNetworks = useRef<Network[]>(fromNetworks)
  const _toNetworks = useRef<Network[]>(toNetworks)
  const _token = useRef<Token | null>(fromInitial?.currencies![0] ?? null)
  const _amount = useRef<number>(0)
  const [triggerUpdate, setTriggerUpdate] = useState<boolean>(false) 

  const update = () => {setTriggerUpdate((c) => (!c))}

  const setFrom = (v: Network | null) => {
    _from.current = v
    update()
  }
 
  const setTo = (v: Network | null) => {
    _to.current = v
    update()
  }
 
  const setAmount = (n: number) => {
    _amount.current = n
  }

  const setToken = (t: Token | null) => {
    _token.current = t
    update()
  }

  const swapFromAndTo = () => {
    const tmp = _from.current
    _from.current = _to.current
    _to.current = tmp
    const tmpNetworks = _fromNetworks.current
    _fromNetworks.current = _toNetworks.current
    _toNetworks.current = tmpNetworks
    setTriggerUpdate((c) => (!c))
  }

  return (
    <div className={cn(
      'flex flex-col justify-start items-center p-6 rounded border border-muted-4', 
      className
    )}>
      <FromToCard 
        swapFromAndTo={swapFromAndTo}
        from={_from.current}
        to={_to.current}
        fromNetworks={_fromNetworks.current}
        toNetworks={_toNetworks.current}
        setFrom={setFrom}
        setTo={setTo}
        className='flex w-full gap-2 relative'
      />
      <TokenCard 
        tokens={_from.current?.currencies!}
        token={_token.current}
        setToken={setToken}
        usdValue={1}
        className='w-full rounded-lg mt-2'
      />
    </div>
  )
}

export default SwapCard
