import React, { useRef } from 'react'

import type { Network, Token } from '@/domain/types'

import DecimalInput from './decimal-input'


const NetworkCombobox: React.FC<{
  networks: Network[]
  network?: Network
  setNetwork: (network: Network) => void
  placeholder?: string
  searchHint?: string
  disabled?: boolean
  className?: string
}> = ({
  networks, 
  network, 
  setNetwork,
  placeholder='',
  searchHint='',
  disabled=false,
  className='' 
}) => {

  const vRef = useRef<string>('')

  const setValue = (v: string) => {
    console.log("DECIMAL INPUT setValue :", v)
    vRef.current = v
  }


  return (
    <div className={className}>
      <DecimalInput className='fg-foreground bg-background border border-muted-3 px-1' value={vRef.current} setValue={setValue} />
    </div>
  )
}

export default NetworkCombobox
