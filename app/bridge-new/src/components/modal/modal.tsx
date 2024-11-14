'use client'
import { type Dispatch, type PropsWithChildren, type ReactNode, type SetStateAction, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";

import useWindowDimensions from "../../hooks/useWindowDimensions";
import { Leaflet, type LeafletHeight } from "./leaflet";
import ReactPortal from "../Common/ReactPortal";

const Modal: React.FC<{
  header?: ReactNode;
  subHeader?: string | JSX.Element
  className?: string;
  height?: LeafletHeight;
  show: boolean;
  setShow: Dispatch<SetStateAction<boolean>>;
  onClose?: () => void
} & PropsWithChildren> = (({ 
  header, 
  height, 
  className, 
  children, 
  subHeader, 
  show, 
  setShow, 
  onClose 
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
      {show && (<>
        {isDesktop && (
          <ReactPortal wrapperId={"modal_portal_root"}>
            <Leaflet
              position="absolute"
              onClose={onClose}
              height={height ?? 'full'}
              ref={mobileModalRef}
              show={show}
              setShow={setShow}
              title={header}
              description={subHeader}
              className={className}
            >
              {children}
            </Leaflet>
          </ReactPortal>
        )}
        {isMobile && (
          <Leaflet
            position="fixed"
            onClose={onClose}
            height={height == 'full' ? '80%' : height == 'fit' ? 'fit' : 'full'}
            ref={mobileModalRef}
            show={show}
            setShow={setShow}
            title={header}
            description={subHeader}
            className={className}
          >
            {children}
          </Leaflet>
        )}
      </>)}
    </AnimatePresence>
  )
})

export default Modal;