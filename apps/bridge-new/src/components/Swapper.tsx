'use client'
import React from 'react'
import { useAtom } from 'jotai'

import { useTelepoterAtom } from '@/store/teleport'
import Teleporter from '@/components/lux/teleport/swap/Form'
import SwapFireblock from '@/components/lux/fireblocks/swap/Form'

const Swapper: React.FC = () => {
  const [useTeleporter, _] = useAtom(useTelepoterAtom)

  return (
    <div className="py-20">
      {useTeleporter ? <Teleporter /> : <SwapFireblock />}
    </div>
  )
}

export default Swapper
