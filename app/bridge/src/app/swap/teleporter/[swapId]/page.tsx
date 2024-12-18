import React from 'react'
import SwapProcess from '@/components/lux/teleport/process'

const SwapDetails: React.FC<{
  params: { swapId: string }
}> = ({ params }) => {
  return <SwapProcess swapId={params.swapId} className="mt-20" />
}

export default SwapDetails
