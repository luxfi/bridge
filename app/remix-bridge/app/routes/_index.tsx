import SwapView from '@/components/swap-widget'
import { ApplyTypography  } from '@hanzo/ui/primitives-common'

const Index: React.FC = ()  =>  (<>
  <ApplyTypography>
    <h3>Lorem ipsum dolor sit amet, consectetur</h3>
  </ApplyTypography>
  <SwapView className='flex flex-col justify-start items-center p-6 rounded border border-muted-3 w-[450px] h-[500px]'/>
</>)

export default Index
