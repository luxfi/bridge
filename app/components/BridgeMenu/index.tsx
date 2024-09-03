'use client'

import React, { useCallback, useEffect, useState } from "react"

import { 
  BookOpen, 
  Gift, 
  MenuIcon, 
  Home, 
  LogIn, 
  LogOut, 
  ScrollText, 
  LibraryIcon, 
  Shield, 
  Users, 
  MessageSquarePlus, 
  UserCircle2 
} from "lucide-react"

import { useRouter } from "next/router"
import dynamic from "next/dynamic"
import { useIntercom } from "react-use-intercom"

import { useAuthDataUpdate, useAuthState, UserType } from "../../context/authContext"
import TokenService from "../../lib/TokenService"
import ChatIcon from "../icons/ChatIcon"
import inIframe from "../utils/inIframe"
import Modal from "../../components/modal/modal"
import Popover from "../modal/popover"
import SendFeedback from "../sendFeedback"
import { shortenEmail } from '../utils/ShortenAddress'
import { resolvePersistantQueryParams } from "../../helpers/querryHelper"
import Menu from "./Menu"
import { Button, LinkElement } from "@luxdefi/ui/primitives"

import socialNav from './social'

const WalletsMenu = dynamic(() => import("../ConnectedWallets").then((comp) => comp.WalletsMenu), {
    loading: () => (<div/>)
})


const BridgeMenu: React.FC = () => {

  const { email, userType, userId } = useAuthState()
  const { setUserType } = useAuthDataUpdate()
  const router = useRouter()
  const { boot, show, update } = useIntercom()
  const [embedded, setEmbedded] = useState<boolean>()
  const [openTopModal, setOpenTopModal] = useState(false)
  const [openFeedbackModal, setOpenFeedbackModal] = useState(false)

  useEffect(() => {
    setEmbedded(inIframe())
  }, [])

  const updateWithProps = () => update({ email: email, userId: userId })

  const handleLogout = useCallback(() => {
    TokenService.removeAuthData();
    if (router.pathname != '/') {
      router.push({
        pathname: '/',
        query: resolvePersistantQueryParams(router.query)
      })
    } 
    else {
      router.reload()
    }
    setUserType(UserType.NotAuthenticatedUser)
  }, [router.query])

  const handleCloseFeedback = () => {
      setOpenFeedbackModal(false)
  }

  const BurgerButton: React.FC = () => (
    <Button
      variant='outline'
      size='square'
      onClick={() => setOpenTopModal(true)}
      aria-label='Main menu'
      className="text-muted-2 hidden md:inline-block"
    >
      <MenuIcon className="h-6 w-6" strokeWidth={2} />
    </Button>
  )

  return ( <>
    <BurgerButton />
    <Modal
      show={openTopModal}
      setShow={setOpenTopModal}
      header={<h2 className="font-normal leading-none tracking-tight">Menu</h2>}
    >
      <div className="text-sm font-medium focus:outline-none h-full">
        <Menu>
          <WalletsMenu />
          <Menu.Group>
            {router.pathname != '/' && (
              <Menu.Item pathname='/' icon={<Home className="h-5 w-5" />} >
                  Home
              </Menu.Item>
            )}
            {router.pathname != '/transactions' && (
              <Menu.Item pathname='/transactions' icon={<ScrollText className="h-5 w-5" />} >
                  Transfers
              </Menu.Item>
            )}
            {!embedded && router.pathname != '/campaigns' && (
              <Menu.Item pathname='/campaigns' icon={<Gift className="h-5 w-5" />} >
                  Campaigns
              </Menu.Item>
            )}
          </Menu.Group>
          <Menu.Group>
              <Menu.Item 
                onClick={() => {
                    boot();
                    show();
                    updateWithProps();
                }} 
                target="_blank" 
                icon={<ChatIcon strokeWidth={2} className="h-5 w-5" />} 
              >
                  Help
              </Menu.Item>
              <Menu.Item pathname='https://docs.bridge.lux.network/' target="_blank" icon={<BookOpen className="h-5 w-5" />} >
                  Docs for Users
              </Menu.Item>
              <Menu.Item pathname='https://docs.bridge.lux.network/user-docs/partners-and-integrations' target="_blank" icon={<Users className="h-5 w-5" />} >
                  Docs for Partners
              </Menu.Item>
          </Menu.Group>
          <Menu.Group>
              <Menu.Item pathname='https://docs.bridge.lux.network/user-docs/information/privacy-policy' target="_blank" icon={<Shield className="h-5 w-5" />} >
                  Privacy Policy
              </Menu.Item>
              <Menu.Item pathname='https://docs.bridge.lux.network/user-docs/information/terms-of-services' target="_blank" icon={<LibraryIcon className="h-5 w-5" />} >
                  Terms of Service
              </Menu.Item>
          </Menu.Group>

          <Menu.Group>
            <Popover
              opener={
                <Menu.Item onClick={() => setOpenFeedbackModal(true)} target="_blank" icon={<MessageSquarePlus className="h-5 w-5" />} >
                    Suggest a Feature
                </Menu.Item>
              }
              isNested={true}
              show={openFeedbackModal}
              header="Suggest a Feature"
              setShow={setOpenFeedbackModal} >
              <div className="p-0 md:max-w-md">
                  <SendFeedback onSend={handleCloseFeedback} />
              </div>
            </Popover>
          </Menu.Group>

          <div className="space-y-3 w-full">
              <hr className="border-muted-3" />
              <p className="text-muted-2 flex justify-center my-3">Media links & suggestions:</p>
          </div>

          <div className="grid grid-row-2 grid-cols-3 gap-1">
          {socialNav.map(({className, ...rest}, index) => (
            <LinkElement
              def={{
                ...rest,
                variant: 'outline',
                size:'sm'
              }}
              className={className + ' font-sans text-muted-2'}
              key={index}
            />
          ))}
          </div>
          {router.pathname != '/auth' && (
            <Menu.Footer>
            {userType == UserType.AuthenticatedUser ? (
              <div
                className='gap-4 flex justify-between items-center relative select-none outline-none w-full'
              >
                <div className="font-normal flex gap-2 items-center">
                  <UserCircle2 className="h-5 w-5" />
                  {email && (<span>{shortenEmail(email, 22)}</span>)}
                </div>
                <LinkElement
                  def={{
                    title: 'Sign out',
                    icon: <LogOut className="h-5 w-5" />,
                    size: 'sm',
                    variant: 'outline'
                  }}
                  onClick={handleLogout}
                  className="font-sans font-semibold text-muted-2"
                />
              </div>
            ):(
              <LinkElement
                def={{
                  href: '/auth',
                  title: 'Sign in',
                  icon: <LogIn className="h-5 w-5" />,
                  size: 'default',
                  variant: 'primary'
                }}
                className="font-sans font-semibold"
              />
            )}
            </Menu.Footer>
          )}
        </Menu>
      </div>
    </Modal>
  </>)
}

export default BridgeMenu
