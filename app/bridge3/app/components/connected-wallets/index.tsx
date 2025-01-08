import { useState, type PropsWithChildren } from 'react'
import { useAccount } from 'wagmi'
import { ChevronDown, Plus } from 'lucide-react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hanzo/ui/primitives-common'

import type { Network } from '@luxfi/core'
import { cn } from '@hanzo/ui/util'

import { shortenAddress } from '@/domain/util'
import { useWallets } from '@/luxkit'
import { useSettings } from '@/contexts/settings'

import WalletIcon from '@/components/icons/wallet-icon'
import TriggerWrapper from './trigger-wrapper'

import WalletIcons from './wallet-icons'

const ConnectedWallets: React.FC<
  {
    connectButtonVariant?: 'outline' | 'primary'
    showWalletIcon?: boolean
    connectButtonClx?: string,
    className?: string
  } & PropsWithChildren
> = ({
  children,
  connectButtonVariant = 'outline',
  showWalletIcon = true,
  connectButtonClx = '',
  className = ''
}) => {
  const { wallets } = useWallets()
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const { chainId, address } = useAccount()
  const { networks } = useSettings()

  //console.log(wallets)

  if (address && chainId) {
    const network = networks.find(
      (n: Network) => Number(n.chain_id) === chainId
    )

    return (
      <div className={cn('flex gap-2 items-center', className)}>
        <img
          src={
            network?.logo ??
            'https://cdn.lux.network/bridge/currencies/lux/lux.svg'
          }
          className='h-[27px] w-[27px] rounded-full'
        />
        <div
          onClick={() => setOpenDialog(true)}
          className='flex gap-1 items-center cursor-pointer bg-level-2 py-[2px] px-2 sm:py-1 rounded-full text-xs sm:text-sm'
        >
          <WalletIcons wallets={wallets} />
          {shortenAddress(address)}
          <ChevronDown className='h-5 w-5' aria-hidden='true' />
        </div>
        <ConnectedWalletsDialog
          openDialog={openDialog}
          setOpenDialog={setOpenDialog}
        />
      </div>
    )
  }

  if (wallets.length > 0) {
    return (
      <>
        <Button
          variant='outline'
          size='square'
          onClick={() => setOpenDialog(true)}
          aria-label='Connect wallet'
          className='text-muted-2 p-0 flex items-center justify-center'
        >
          <WalletIcons wallets={wallets} />
        </Button>
        <ConnectedWalletsDialog
          openDialog={openDialog}
          setOpenDialog={setOpenDialog}
        />
      </>
    )
  }

  return (
    <TriggerWrapper>
      <Button
        variant={connectButtonVariant}
        size='square'
        aria-label='Connect wallet'
        className={cn(
          'flex items-center justify-center',
          'text-muted-2 p-0 ',
          connectButtonClx
        )}
      >
        {showWalletIcon && (
          <WalletIcon className='h-5 w-5 mx-0.5' strokeWidth='1.5' />
        )}
        {children}
      </Button>
    </TriggerWrapper>
  )
}

// :aa where is this used??
const WalletsMenu = () => {
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const { wallets } = useWallets()
  const wallet = wallets[0]

  if (wallets.length > 0) {
    return (
      <>
        <button
          onClick={() => {
            setOpenDialog(true)
          }}
          type='button'
          className={
            'py-3 px-4 relative flex items-center w-full rounded-md space-x-1 ' +
            'bg-level-1 hover:bg-level-2 font-semibold ' +
            'transform transition duration-200 ease-in-out'
          }
        >
          {wallets.length === 1 ? (
            <div className='flex gap-4 items-start'>
              <div className='inline-flex items-center relative'>
                {/* <AddressIcon address={wallet.address} size={20} /> */}
                {wallet.connector && (
                  <span className='absolute -bottom-1 -right-2 ml-1 text-[10px] leading-4 font-semibold'>
                    <wallet.icon className='w-4 h-4 border-2 rounded-full' />
                  </span>
                )}
              </div>
              <p>{shortenAddress(wallet.address)}</p>
            </div>
          ) : (
            <>
              <div className='flex justify-center w-full'>
                Connected wallets
              </div>
              <div className='place-items-end absolute left-2.5'>
                <WalletIcons wallets={wallets} />
              </div>
            </>
          )}
        </button>
        <ConnectedWalletsDialog
          openDialog={openDialog}
          setOpenDialog={setOpenDialog}
        />
      </>
    )
  }

  return (
    <TriggerWrapper>
      <Button
        className='border-none !px-4 flex justify-center gap-2'
        type='button'
      >
        <WalletIcon className='h-5 w-5' strokeWidth={2} />
        <span>Connect a wallet</span>
      </Button>
    </TriggerWrapper>
  )
}

const ConnectedWalletsDialog = ({
  openDialog,
  setOpenDialog,
}: {
  openDialog: boolean
  setOpenDialog: (open: boolean) => void
}) => {
  const { wallets, disconnectWallet } = useWallets()

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle className='text-center'>Wallets</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col justify-start space-y-2'>
          {wallets.map((wallet, index) => (
            <div
              key={index}
              className='w-full relative items-center justify-between gap-2 flex rounded-md outline-none bg-level-1 p-3 border border-[#404040] '
            >
              <div className='flex space-x-4 items-center'>
                {wallet.connector && (
                  <div className='inline-flex items-center relative'>
                    <wallet.icon className='w-8 h-8 p-0.5' />
                  </div>
                )}
                <p>{shortenAddress(wallet.address)}</p>
              </div>
              <button
                onClick={() => {
                  disconnectWallet(wallet.providerName)
                  if (wallets.length === 1) {
                    setOpenDialog(false)
                  }
                }}
                className='p-1 hover:bg-level-2 text-xs  hover:opacity-75'
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <TriggerWrapper
            onClose={() => {
              setOpenDialog(false)
            }}
          >
            <div className='hover:text-opacity-80 flex items-center gap-1 justify-end w-fit'>
              <Plus className='h-4 w-4' />
              <span className='text-sm'>Link a new wallet</span>
            </div>
          </TriggerWrapper>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { ConnectedWallets as default, WalletsMenu, ConnectedWallets }
