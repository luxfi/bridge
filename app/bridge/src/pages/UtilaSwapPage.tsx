import SwapProcess from '@/components/lux/utila/process'

export default function UtilaSwapPage({ params }: { params: { swapId: string } }) {
  return <SwapProcess swapId={params.swapId} className="mt-20" />
}
