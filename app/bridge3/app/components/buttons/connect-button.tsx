'use client'

import { type PropsWithChildren, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@hanzo/ui/primitives-common'

import RainbowIcon from '@/components/icons/wallets/rainbow'
import TON from '@/components/icons/wallets/ton'
import MetaMaskIcon from '@/components/icons/wallets/metamask'
import WalletConnectIcon from '@/components/icons/wallets/walletconnect'
import TonKeeper from '@/components/icons/wallets/tonkeeper'
import OpenMask from '@/components/icons/wallets/openmask'
import Phantom from '@/components/icons/wallets/phantom'
import Solflare from '@/components/icons/wallets/solflare'
import CoinbaseIcon from '@/components/icons/wallets/coinbase'
import { cn } from '@hanzo/ui/util'
import useWallet from '@/domain/wallets/useWallet'

const knownConnectors = [
  {
    name: 'EVM',
    id: 'evm',
    type: 'evm',
  },
  // {
  //   name: 'Starknet',
  //   id: 'starknet',
  //   type: 'starknet'
  // },
  {
    name: 'TON',
    id: 'ton',
    type: 'ton'
  },
  {
    name: 'Solana',
    id: 'solana',
    type: 'solana'
  }
]

const ConnectButton: React.FC<{
  className?: string
  onClose?: () => void
} & PropsWithChildren> = ({
  children,
  className,
  onClose,
}) => {

    const { connectWallet, wallets } = useWallet()
    const [open, setOpen] = useState<boolean>()

    const filteredConnectors = knownConnectors.filter(
      (c) => !wallets.map((w) => w?.providerName).includes(c.id)
    )

    const isMobile = false

    return isMobile ? (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild aria-label='Connect wallet'>{children}</DialogTrigger>
        <DialogContent className='sm:max-w-[425px] text-muted bg-level-1 border-[#404040]'>
          <DialogHeader>
            <DialogTitle className='text-center'>Link a new wallet</DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            {filteredConnectors.map((connector, index) => (
              <button
                type='button'
                key={index}
                className='w-full h-fit rounded py-2 px-3 hover:bg-level-2 '
                onClick={() => {
                  connectWallet(connector.id)
                  setOpen(false)
                  onClose && onClose()
                }}
              >
                <div className='flex space-x-2 items-center'>
                  {connector && (
                    <div className='inline-flex items-center relative'>
                      <ResolveConnectorIcon
                        connector={connector.id}
                        className='w-7 h-7 p-0.5 rounded-full border border-level-2'
                      />
                    </div>
                  )}
                  <p>{connector.name}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    ) : (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          asChild
          aria-label='Connect wallet'
          disabled={filteredConnectors.length == 0}
          className={cn(className, 'disabled:cursor-not-allowed')}
        >
          {children}
        </PopoverTrigger>
        <PopoverContent className='flex flex-col items-start gap-2 w-fit bg-level-1 border-[#404040]'>
          {filteredConnectors.map((connector, index) => (
            <button
              type='button'
              key={index}
              className='w-full h-full hover:bg-level-2 rounded py-2 px-3'
              onClick={() => {
                connectWallet(connector.id)
                setOpen(false)
                onClose && onClose()
              }}
            >
              <div className='flex space-x-2 items-center'>
                {connector && (
                  <div className='inline-flex items-center relative'>
                    <ResolveConnectorIcon
                      connector={connector.id}
                      className='w-7 h-7 p-0.5 rounded-full border border-level-2'
                    />
                  </div>
                )}
                <p>{connector.name}</p>
              </div>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    )
  }

export default ConnectButton

const ResolveConnectorIcon = ({
  connector,
  className,
}: {
  connector: string
  className: string
}) => {
  switch (connector.toLowerCase()) {
    case KnownConnectors.EVM:
      return (
        <div className='-space-x-2 flex'>
          <RainbowIcon className={className} />
          <MetaMaskIcon className={className} />
          <WalletConnectIcon className={className} />
        </div>
      )
    // case KnownConnectors.Starknet:
    //   return (
    //     <div className='-space-x-2 flex'>
    //       <Braavos className={className} />
    //       <Argent className={className} />
    //       <ArgentX className={className} />
    //     </div>
    //   )
    case KnownConnectors.TON:
      return (
        <div className='-space-x-2 flex'>
          <TonKeeper className={className} />
          <OpenMask className={className} />
          <TON className={className} />
        </div>
      )
    case KnownConnectors.Solana:
      return (
        <div className='-space-x-2 flex'>
          <Phantom className={className} />
          <Solflare className={className} />
          <WalletConnectIcon className={className} />
          <CoinbaseIcon className={className} />
        </div>
      )
    default:
      return <></>
  }
}

const KnownConnectors = {
  //Starknet: 'starknet',
  EVM: 'evm',
  TON: 'ton',
  Solana: 'solana',
}
