import React, { useRef, useState } from 'react'

import type { Network } from '@/domain/types'

// import DecimalInput from './decimal-input'
import NetworkCombobox from '../network-combobox'
import ReverseButton from './reverse-button'

const SwapView: React.FC<{
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

  const vRef = useRef<string>('')
  const [_from, _setFrom] = useState<Network | null>(fromInitial ?? null)
  const [_to, _setTo] = useState<Network | null>(toInitial ?? null)
  const [_fromNetworks, _setFromNetworks] = useState<Network[]>(fromNetworks)
  const [_toNetworks, _setToNetworks]  = useState<Network[]>(toNetworks)
  //const [updateMe, setUpdateMe] = useState<boolean>(false) // allow forced update

  const setValue = (v: string) => {
    console.log("SwapView setValue :", v)
    vRef.current = v
  }

  const setFromNetwork = (n: Network | null) => {
    console.log("SwapView setFromNetwork :", n?.display_name)
    _setFrom(n)
  }

  const setToNetwork = (n: Network | null) => {
    console.log("SwapView settoNetwork :", n?.display_name)
    _setTo(n)
  }

  const reverse = () => {
    const tmp = _from
    //console.log("TMP", tmp)
    _setFrom(_to)
    //console.log("TO", _to)
    _setTo(tmp)
    const tmpNetworks = _fromNetworks
    _setFromNetworks(_toNetworks)
    _setToNetworks(tmpNetworks)
    //setUpdateMe(!updateMe)
    
    console.log("REVERSE")
  }


  return (
    <div className={className}>
      <div className='flex w-full gap-2 relative'>
        <NetworkCombobox
          networks={_fromNetworks}
          setNetwork={setFromNetwork}
          network={_from}
          buttonClx='grow pr-4 overflow-x-hidden'
          popoverClx='w-[350px]'
          popoverAlign='start'
          label='from'
        />
        <NetworkCombobox
          networks={_toNetworks}
          setNetwork={setToNetwork}
          network={_to}
          buttonClx='grow pl-4 overflow-x-hidden'
          popoverClx='w-[350px]'
          popoverAlign='end'
          label='to'
          rightJustified
        />
        <ReverseButton onClick={reverse} className='p-1 h-auto text-muted active:!bg-level-3' style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)'
        }}/>
      </div>
    </div>
  )
}

export default SwapView