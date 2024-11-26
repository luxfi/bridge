import React from 'react'
import dynamic from "next/dynamic"

import { ChevronDown } from 'lucide-react'


const ConnectedWallets = dynamic(
  () => import("../ConnectedWallets").then((comp) => (comp.ConnectedWallets)), 
  { loading: () => (null) }
)

const HeaderConnectUI: React.FC = () => (
  <ConnectedWallets 
    buttonSize='default'
    connectButtonVariant='outline' 
    showWalletIcon={false}
    connectButtonClx='pl-3 pr-2 flex rounded-lg relative'
  >
    <span className='pr-1.5'>Connect</span>
    <span className='pr-1'>|</span>
    <span className=''>
      <ChevronDown className="h-4 w-4" aria-hidden="true" />
    </span>
  </ConnectedWallets >
)

export default HeaderConnectUI
