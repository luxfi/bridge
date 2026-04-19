import SwapProcess from '@/components/lux/teleport/process'

export default function TeleporterSwapPage({ params }: { params: { swapId: string } }) {
  return <SwapProcess swapId={params.swapId} className="mt-20" />
}
