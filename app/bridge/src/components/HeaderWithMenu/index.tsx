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
import { usePathname } from 'next/navigation'
import { useAtom } from 'jotai'
import { useTelepoterAtom } from '@/store/teleport'

const HeaderWithMenu: React.FC<{
  goBack: (() => void) | undefined
}> = ({ goBack }) => {
  // hooks
  const { email, userId } = useAuthState()
  const { boot, show, update } = useIntercom()
  const pathname = usePathname()

  const updateWithProps = () => {
    update({ email: email, userId: userId })
  }

  const [useTeleporter, setUseTeleporter] = useAtom(useTelepoterAtom)

  const handleBridgeTypeChange = (value: boolean) => {
    setUseTeleporter(value)
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
    <div className="w-full xs:flex md:grid md:grid-cols-5 px-3 md:px-6 mt-3 items-center xs:justify-between">
      <div>
        {goBack ? (
          <IconButton onClick={goBack} aria-label="Go back" icon={<ArrowLeft strokeWidth="3" />} />
        ) : (
          <div className={cn('flex items-center gap-2', pathname !== '/' ? 'hidden' : '')}>
            <ToggleButton value={useTeleporter} onChange={handleBridgeTypeChange} name="Teleport" />
            Teleport
          </div>
        )}
      </div>

      <div className="col-start-5 justify-self-end self-center flex items-center gap-3">
        {/* <ConnectWallets /> */}
        {/* <ChatButton /> */}
        <BridgeMenu />
      </div>
    </div>
  )
}

export default HeaderWithMenu
