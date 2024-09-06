'use client'
import { FC, PropsWithChildren, useEffect, useRef } from 'react'
import { useFormWizardaUpdate, useFormWizardState } from '../../context/formWizardProvider';
import { AnimatePresence } from 'framer-motion';
import HeaderWithMenu from '../HeaderWithMenu';


const Wizard: FC<PropsWithChildren> = ({ children }) => {

  const wrapper = useRef<HTMLDivElement>(null);

  const { setWrapperWidth } = useFormWizardaUpdate()
  const { wrapperWidth, positionPercent, moving, goBack, noToolBar, hideMenu } = useFormWizardState()

  useEffect(() => {
    function handleResize() {
        if (wrapper.current !== null) {
          setWrapperWidth(wrapper.current.offsetWidth);
        }
    }
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className={noToolBar ? '' : 'border border-[#404040] rounded-lg w-full sm:overflow-hidden'}>
      {!hideMenu && <HeaderWithMenu goBack={goBack} />}
      <div className={noToolBar ? '' : 'px-6'}>
        <div className="flex items-start" ref={wrapper}>
          <AnimatePresence initial={false} custom={{ direction: moving === "forward" ? 1 : -1, width: wrapperWidth }}>
            <div className='flex flex-nowrap'>
              {children}
            </div>
          </AnimatePresence>
        </div>
      </div>
      <div id="widget_root" />
    </div>
  )
}

export default Wizard
