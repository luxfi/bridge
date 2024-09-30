'use client'
import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from '@luxdefi/ui/primitives'

import WalletIcon from "./icons/WalletIcon"
import shortenAddress from "./utils/ShortenAddress"
import useWallet from "../hooks/useWallet"
import ConnectButton from "./buttons/connectButton"
import SubmitButton from "./buttons/submitButton"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./shadcn/dialog"
import AddressIcon from "./AddressIcon"
import { Wallet } from "../stores/walletStore"

export const WalletsHeader = () => {

  const { wallets } = useWallet()
  const [openDialog, setOpenDialog] = useState<boolean>(false)

  if (wallets.length > 0) {
    return (<>
      <Button
        variant='outline'
        size='square'
        onClick={() => setOpenDialog(true)}
        aria-label='Connect wallet'
        className="text-muted-2"
      >
        <WalletsIcons wallets={wallets} />
      </Button>
      <ConnectedWalletsDialog openDialog={openDialog} setOpenDialog={setOpenDialog} />
    </>)
  }

  return (
    <ConnectButton>
      <Button
        variant='outline'
        size='square'
        aria-label='Connect wallet'
        className="text-muted-2"
      >
        <WalletIcon className="h-6 w-6 mx-0.5" strokeWidth="1.5" />
      </Button>
    </ConnectButton>
  )
}

const WalletsIcons = ({ wallets }: { wallets: Wallet[] }) => {
  const firstWallet = wallets[0]
  const secondWallet = wallets[1]

  return (
    <div className="-space-x-2 flex">
      {
        firstWallet?.connector &&
        <firstWallet.icon className="flex-shrink-0 h-6 w-6" />
      }
      {
        secondWallet?.connector &&
        <secondWallet.icon className="flex-shrink-0 h-6 w-6" />
      }
      {
        wallets.length > 2 &&
        <div className="h-6 w-6 flex-shrink-0 rounded-full justify-center p-1 overlfow-hidden text-xs">
          <span><span>+</span>{wallets.length - 2}</span>
        </div>
      }
    </div>
  )
}

export const WalletsMenu = () => {
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const { wallets } = useWallet()
  const wallet = wallets[0]
  if (wallets.length > 0) {
    return (<>
      <button
        onClick={() => { setOpenDialog(true) }}
        type="button"
        className={'py-3 px-4 relative flex items-center w-full rounded-md space-x-1 ' +
          'bg-level-1 hover:bg-level-2 font-semibold ' +
          'transform transition duration-200 ease-in-out'
        }
      >
        {wallets.length === 1 ? (
          <div className="flex gap-4 items-start">
            <div className="inline-flex items-center relative">
              <AddressIcon address={wallet.address} size={20} />
              {
                wallet.connector && <span className="absolute -bottom-1 -right-2 ml-1 text-[10px] leading-4 font-semibold">
                  <wallet.icon className="w-4 h-4 border-2 rounded-full" />
                </span>
              }
            </div>
            <p>{shortenAddress(wallet.address)}</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center w-full">
              Connected wallets
            </div>
            <div className="place-items-end absolute left-2.5">
              <WalletsIcons wallets={wallets} />
            </div>
          </>
        )}
      </button>
      <ConnectedWalletsDialog openDialog={openDialog} setOpenDialog={setOpenDialog} />
    </>)
  }

  return (
    <ConnectButton>
      <SubmitButton
        text_align="center"
        icon={<WalletIcon className='h-5 w-5' strokeWidth={2} />}
        className='border-none !px-4' type="button" isDisabled={false} isSubmitting={false}
      >
        Connect a wallet
      </SubmitButton>
    </ConnectButton>
  )
}

const ConnectedWalletsDialog = ({ openDialog, setOpenDialog }: { openDialog: boolean, setOpenDialog: (open: boolean) => void }) => {
  const { wallets, disconnectWallet } = useWallet()

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-center">Wallets</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col justify-start space-y-2">
          {wallets.map((wallet, index) => (
            <div key={index} className="w-full relative items-center justify-between gap-2 flex rounded-md outline-none bg-level-1 p-3 border border-[#404040] ">
              <div className="flex space-x-4 items-center">
                {wallet.connector && (
                  <div className="inline-flex items-center relative">
                    <wallet.icon className="w-8 h-8 p-0.5" />
                  </div>
                )}
                <p>{shortenAddress(wallet.address)}</p>
              </div>
              <button
                onClick={
                  () => {
                    disconnectWallet(wallet.providerName);
                    // wallets.length === 1 && setOpenDialog(false)
                  }
                }
                className="p-1 hover:bg-level-2 text-xs  hover:opacity-75"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <ConnectButton onClose={() => { setOpenDialog(false) }}>
            <div className='hover:text-opacity-80 flex items-center gap-1 justify-end w-fit'>
              <Plus className="h-4 w-4" />
              <span className="text-sm">
                Link a new wallet
              </span>
            </div>
          </ConnectButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
