import React from 'react'
import Image from 'next/image'

import pic1 from './images/01.png'
import pic2Network from './images/02Network.png'
import pic2Exchange from './images/02Exchange.png'
import pic3 from './images/03.png'

import type { SwapItem } from '../../lib/BridgeApiClient'


const SwapGuide: React.FC<{ 
  swap: SwapItem 
}> = ({ 
  swap 
}) => (
  <div className='rounded-md w-full flex flex-col items-left justify-center space-y-4 text-left '>
      <p className=''><span>To complete the swap,&nbsp;</span><strong>manually send</strong><span>&nbsp;assets from your wallet, to the&nbsp;</span><strong>Deposit Address</strong><span>&nbsp;generated by Bridge.</span></p>
      <div className='space-y-3'>
          <p className='text-base font-semibold '>🪜 Steps</p>
          <div className='space-y-5 text-base '>
              <div className='space-y-3'>
                  <p><span className=''>.01</span><span>&nbsp;Copy the Deposit Address, or scan the QR code</span></p>
                  <div className='border-2 border-level-3 rounded-xl p-2 bg-level-2'>
                      <Image src={pic1} className='w-full rounded-xl' alt={''} />
                  </div>
              </div>
              <div className='space-y-3'>
                  <p><span className=''>.02</span><span>&nbsp;Send&nbsp;</span><span className=''>{swap?.destination_network_asset}</span><span>&nbsp;to that address from your&nbsp;</span><span>{swap?.source_exchange ? 'exchange account' : 'wallet'}</span></p>
                  <div className='border-2 border-level-3 rounded-xl p-2 bg-level-2'>
                      <Image src={swap?.source_exchange ? pic2Exchange : pic2Network} className='w-full rounded-xl' alt={''} />
                  </div>
              </div>
              {swap?.source_exchange && <div className='space-y-3'>
                  <p><span className=''>.03</span><span>&nbsp;Make sure to send via one of the supported networks</span></p>
                  <div className='border-2 border-level-3 rounded-xl p-2 bg-level-2'>
                      <Image src={pic3} className='w-full rounded-xl' alt={''} />
                  </div>
              </div>}
          </div>
      </div>
  </div>
)

export default SwapGuide
