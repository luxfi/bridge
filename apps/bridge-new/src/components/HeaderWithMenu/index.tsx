'use client'
import { useIntercom } from "react-use-intercom"
import { useAuthState } from "../../context/authContext"
import IconButton from "../buttons/iconButton"
import GoHomeButton from "../utils/GoHome"
import { ArrowLeft } from 'lucide-react'
import ChatIcon from "../icons/ChatIcon"
import dynamic from "next/dynamic"
import BridgeMenu from "../BridgeMenu"
import { Button } from "@hanzo/ui/primitives"
import ToggleButton from "../buttons/toggleButton"
import { useAtom } from "jotai"
import { useTelepoterAtom } from "@/store/teleport"
import type React from "react"

const WalletsHeader = dynamic(
  () => import("../ConnectedWallets").then((comp) => (comp.WalletsHeader)), 
  { loading: () => (null) }
)

const HeaderWithMenu: React.FC<{ 
  goBack: (() => void) | undefined 
}> = ({ 
  goBack 
}) => {

  const [useTeleporter, setUseTeleporter] = useAtom(useTelepoterAtom);
  const { email, userId } = useAuthState()
  const { boot, show, update } = useIntercom()
  const updateWithProps = () => { update({ email: email, userId: userId }) }

  const ChatButton: React.FC = () => (
    <Button
      variant='outline'
      size='square'
      onClick={() => {
        boot();
        show();
        updateWithProps()
      }}
      aria-label='Open chat'
      className="text-muted-2 hidden md:inline-block"
    >
      <ChatIcon className="h-6 w-6" strokeWidth="1.5" />
    </Button>
  )

  return (
    <div className="w-full grid grid-cols-5 px-6 mt-3 items-center justify-center" >
    {goBack ? (
      <IconButton
        onClick={goBack}
        aria-label="Go back"
        icon={<ArrowLeft strokeWidth="3" />}
      />
    ) : (
      <div className='flex items-center gap-2'>
        <ToggleButton
          value={useTeleporter}
          onChange={(b: boolean) => { setUseTeleporter(b) }}
          name="Teleport"
        />
        Teleport
      </div>      
    )}

      <div className='justify-self-center self-center col-start-2 col-span-3 mx-auto overflow-hidden md:hidden'>
        <GoHomeButton />
      </div>

      <div className="col-start-5 justify-self-end self-center flex items-center gap-3">
        <WalletsHeader />
        {/* <ChatButton /> */}
        <BridgeMenu />
      </div>
    </div>
  )
}

export default HeaderWithMenu