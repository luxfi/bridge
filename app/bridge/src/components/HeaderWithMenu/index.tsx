'use client'
import type React from 'react'
import { useIntercom } from 'react-use-intercom'
import { useAuthState } from '../../context/authContext'
import IconButton from '../buttons/iconButton'
import ToggleButton from '../buttons/toggleButton'
import GoHomeButton from '../utils/GoHome'
import ChatIcon from '../icons/ChatIcon'
import dynamic from 'next/dynamic'
import BridgeMenu from '../BridgeMenu'
import { cn } from '@hanzo/ui/util'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@hanzo/ui/primitives'
//hooks
import { useRouter, useSearchParams } from 'next/navigation'
import { usePathname } from 'next/navigation'

const ConnectWallets = dynamic(
  () => import('../ConnectedWallets').then((comp) => comp.ConnectedWallets),
  { loading: () => null }
)

const HeaderWithMenu: React.FC<{
  goBack: (() => void) | undefined
}> = ({ goBack }) => {
  // hooks
  const { email, userId } = useAuthState()
  const { boot, show, update } = useIntercom()
  const pathname = usePathname()
  const router = useRouter()

  const updateWithProps = () => {
    update({ email: email, userId: userId })
  }

  const useTeleporter =
    useSearchParams().get('teleport') === 'true' ? true : false

  const handleBridgeTypeChange = (value: boolean) => {
    router.push(`${pathname}?teleport=${value}`)
  }

  const ChatButton: React.FC = () => (
    <Button
      variant="outline"
      size="square"
      onClick={() => {
        boot()
        show()
        updateWithProps()
      }}
      aria-label="Open chat"
      className="text-muted-2 hidden md:inline-block"
    >
      <ChatIcon className="h-6 w-6" strokeWidth="1.5" />
    </Button>
  )

  return (
    <div className="w-full flex flex-row-reverse justify-between items-center pt-3 px-6">
      <div className="justify-between sm:justify-end sm:w-auto flex flex-row items-center gap-3">
        {/* <ChatButton /> */}
        <BridgeMenu />
        <ConnectWallets className='sm:hidden'/>
      </div>
      {goBack ? (
        <IconButton
          onClick={goBack}
          aria-label="Go back"
          icon={<ArrowLeft strokeWidth="3" />}
        />
      ) : (
        <div
          className={cn(
            'flex grow items-center gap-2',
            pathname !== '/' ? 'hidden' : ''
          )}
        >
          <ToggleButton
            value={useTeleporter}
            onChange={handleBridgeTypeChange}
            name="Teleport"
          />
          Teleport
        </div>
      )}

      {/*
      <div className='justify-center self-center col-start-2 col-span-3 mx-auto overflow-hidden '>
        <GoHomeButton />
      </div>
    */}
    </div>
  )
}

export default HeaderWithMenu
