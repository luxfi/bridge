import React, { Dispatch, ReactNode, SetStateAction, useEffect, useRef } from "react"

import { AnimatePresence } from "framer-motion"

import useWindowDimensions from "../../hooks/useWindowDimensions"
import Leaflet, { type LeafletHeight } from "./leaflet"
import ReactPortal from "../Common/ReactPortal"

const Modal: React.FC<{
  header?: ReactNode;
  subHeader?: string | JSX.Element
  children?: JSX.Element | JSX.Element[];
  className?: string;
  height?: LeafletHeight;
  show: boolean;
  setShow: Dispatch<SetStateAction<boolean>>
}> = ({ 
  header, 
  height, 
  className, 
  children, 
  subHeader, 
  show, 
  setShow 
}) => {

  const { isMobile, isDesktop } = useWindowDimensions()
  const mobileModalRef = useRef(null)

  useEffect(() => {
    if (isMobile && show) {
      window.document.body.style.overflow = 'hidden'
    }
    return () => { window.document.body.style.overflow = '' }
  }, [isMobile, show])

  return (
    <AnimatePresence>
      {show && isDesktop && (
        <ReactPortal wrapperId={"widget_root"}>
          <Leaflet position="absolute" height={height ?? 'full'} ref={mobileModalRef} show={show} setShow={setShow} title={header} description={subHeader} className={className}>
            {children}
          </Leaflet>
        </ReactPortal>
      )}
      {show && isMobile && (
        <Leaflet position="fixed" height={height == 'full' ? '80%' : height == 'fit' ? 'fit' : 'full'} ref={mobileModalRef} show={show} setShow={setShow} title={header} description={subHeader} className={className}>
            {children}
        </Leaflet>
      )}
    </AnimatePresence>
  )
}

export default Modal
