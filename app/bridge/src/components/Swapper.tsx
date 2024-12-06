'use client'
import React from 'react'
import { useSearchParams } from 'next/navigation'

import Teleporter from '@/components/lux/teleport/swap/Form'
import SwapUtila from '@/components/lux/utila/swap/Form'

const Swapper: React.FC = () => {
  
  const useTeleporter = useSearchParams().get('teleport') === 'true' ? true : false

  return (
    <div className="xs:w-full md:w-auto md:py-20">
      {useTeleporter ? <Teleporter /> : <SwapUtila />}
    </div>
  )
}

export default Swapper
