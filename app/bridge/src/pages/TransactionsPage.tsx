import TransfersWrapper from '@/components/SwapHistory/TransfersWrapper'
import { SwapDataProvider } from '@/context/swap'

export default function TransactionsPage() {
  return (
    <SwapDataProvider>
      <TransfersWrapper />
    </SwapDataProvider>
  )
}
