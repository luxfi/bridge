import { FC, type PropsWithChildren } from 'react'

import { ConnectButton } from '@rainbow-me/rainbowkit';

const RainbowKit: FC<PropsWithChildren> = ({ children }) => (
  <ConnectButton.Custom>
  {({
    account,
    chain,
    openChainModal,
    openConnectModal,
    mounted,
  }) => {
      const ready = mounted;
      const connected = ready && account && chain;
      return (
        <div
          {...(!ready && {
            'aria-hidden': true,
            'style': {
              opacity: 0,
              pointerEvents: 'none',
              userSelect: 'none',
            },
          })}
        >
          {(!connected) && (
            <span className='w-full cursor-pointer' onClick={openConnectModal} >
              {children}
            </span>
          )}
          { chain?.unsupported && (
            <button onClick={openChainModal} type="button">
              Change network
            </button>
          )}
        </div>
      )
  }}
  </ConnectButton.Custom>
)

export default RainbowKit;