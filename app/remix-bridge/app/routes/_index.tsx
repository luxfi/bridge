import SwapView from '@/components/swap-widget'
import { ApplyTypography  } from '@hanzo/ui/primitives-common'

import { networks  } from '@/domain/settings/teleport/networks.mainnets'
import type { Network } from '@/domain/types'


const fromInitial = networks.find((el: Network) => (el.display_name === 'Base'))
const toInitial = networks.find((el: Network) => (el.display_name === 'Ethereum'))

const Index: React.FC = () => (<>
  <ApplyTypography>
    <h3>Lorem ipsum dolor sit amet, consectetur</h3>
  </ApplyTypography>
  <SwapView 
    className='flex flex-col justify-start items-center p-6 rounded border border-muted-3 w-[450px] h-[500px]'
    fromNetworks={networks}
    fromInitial={fromInitial}
    toNetworks={networks}
    toInitial={toInitial}
  />
</>)

export default Index
