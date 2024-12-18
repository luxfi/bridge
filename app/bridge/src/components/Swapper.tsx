'use client'
import React from 'react'
import { useSearchParams } from 'next/navigation'

import Teleporter from '@/components/lux/teleport/swap/Form'
import SwapUtila from '@/components/lux/utila/swap/Form'
import { useAtom } from 'jotai'
import { useTelepoterAtom } from '@/store/teleport'

const Swapper: React.FC = () => {
  const [useTeleporter] = useAtom(useTelepoterAtom)
  return <div className="xs:w-full md:w-auto md:py-20">{useTeleporter ? <Teleporter /> : <SwapUtila />}</div>
}

export default Swapper
