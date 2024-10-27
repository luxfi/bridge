import TransfersWrapper from '@/components/SwapHistory/TransfersWrapper'
import { SwapDataProvider } from '@/context/swap'

const Transactions: React.FC = () => (
  <SwapDataProvider>
    <TransfersWrapper />
  </SwapDataProvider>
)

export default Transactions
