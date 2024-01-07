import { Dispatch, SetStateAction, ReactNode, useEffect } from "react"

import { AnimatePresence } from "framer-motion";

import useWindowDimensions from "../../hooks/useWindowDimensions";
import Leaflet from "./leaflet";

const Popover: React.FC<{
  children: ReactNode;
  opener: ReactNode | string;
  align?: "center" | "start" | "end";
  show: boolean;
  isNested?: boolean;
  setShow: Dispatch<SetStateAction<boolean>>;
  header?: ReactNode;
}> = ({
  children,
  opener,
  show,
  setShow,
  header,
}) => {

  const { isMobile } = useWindowDimensions();

  useEffect(() => {
    if (isMobile && show) {
      window.document.body.style.overflow = 'hidden'
    }
    return () => { window.document.body.style.overflow = '' }
  }, [isMobile, show])

  return (
    <AnimatePresence>
      <div>
        {opener}
        {show && <Leaflet position="fixed" height="fit" title={header} setShow={setShow} show={show}>
          {children}
        </Leaflet>}
      </div>
    </AnimatePresence>
  )
}

export default Popover
