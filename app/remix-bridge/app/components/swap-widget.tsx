import React, { useRef } from 'react'

import DecimalInput from './decimal-input'


const SwapView: React.FC<{
  className?: string
}> = ({
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

export default SwapView