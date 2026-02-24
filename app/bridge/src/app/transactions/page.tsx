import TransfersWrapper from '@/components/SwapHistory/TransfersWrapper'
import { SwapDataProvider } from '@/context/swap'

export const dynamic = 'force-dynamic'

const Transactions: React.FC = () => (
  <SwapDataProvider>
    <TransfersWrapper />
  </SwapDataProvider>
)

export default Transactions
