import React from 'react'
import SwapProcess from '@/components/lux/utila/process'

const SwapDetails: React.FC<{
  params: { swapId: string }
}> = ({ params }) => {
  return <SwapProcess swapId={params.swapId} className="my-20" />
}

export default SwapDetails
