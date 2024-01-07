import { type Dispatch, type PropsWithChildren, type SetStateAction, useEffect, useRef, forwardRef } from 'react'

import { PanInfo, motion, useAnimation } from "framer-motion"
import { X } from 'lucide-react'

import IconButton from '../buttons/iconButton'

export type LeafletHeight = 'fit' | 'full' | '80%' | '90%'

// Relative gives the div a relative position allowing the parent to put it inside a React Portal. Appwide makes it fixed, so it renders on top of the app.
export type LeafletPosition = 'absolute' | 'fixed'

interface LeafletProps {
    show: boolean;
    setShow: Dispatch<SetStateAction<boolean>>;
    title?: React.ReactNode;
    description?: JSX.Element | string;
    className?: string;
    height?: LeafletHeight;
    position: LeafletPosition;
}

// TODO handle overflow when height is set to 'fit'
const Leaflet = forwardRef<HTMLDivElement, PropsWithChildren<LeafletProps>>(function Leaflet({ show, setShow, children, title, className, height, description, position }, topmostRef) {
    const mobileModalRef = useRef<HTMLDivElement>(null);
    const controls = useAnimation();
    const transitionProps = { type: "spring", stiffness: 500, damping: 40 };

    async function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
        const offset = info.offset.y;
        const velocity = info.velocity.y;
        const height = mobileModalRef.current?.getBoundingClientRect().height || 0;
        if (offset > height / 2 || velocity > 800) {
            await controls.start({ y: "100%", transition: transitionProps, });
            setShow(false);
        } else {
            controls.start({ y: 0, transition: transitionProps });
        }
    }

    useEffect(() => {
        if (show) {
            controls.start({
                y: 0,
                transition: transitionProps,
            });
        }
    }, [controls, show, transitionProps]);

    const handleCloseModal = () => {
        setShow(false);
    }

    let wrapperHeightClass = ''
    switch (height) {
        case 'full':
            wrapperHeightClass = 'h-full'
            break;
        case '90%':
            wrapperHeightClass = 'h-[90%]'
            break;
        case '80%':
            wrapperHeightClass = 'h-[80%]'
            break;
        default:
            wrapperHeightClass = ''
    }

      // order is important 
    const mobileClassName = 
      wrapperHeightClass
      + ' max-h-full overflow-y-auto group ' 
      + position 
      + ' inset-x-0 bottom-0 z-40 w-full '  
      + ((height === 'full') ? '' : 'rounded-t-2xl border-t border-level-2')
      + ' bg-level-1 ' + className + ' shadow-lg'; 


    return (
        <div ref={topmostRef}>
            <motion.div
                key="backdrop"
                className={`${position} inset-0 z-20`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseModal}
            />
            <motion.div
                key="mobile-modal"
                ref={mobileModalRef}
                className={mobileClassName}
                initial={{ y: "20%" }}
                animate={controls}
                exit={{ y: "100%" }}
                transition={transitionProps}
                drag={height != 'full' ? "y" : false}
                dragDirectionLock
                onDragEnd={handleDragEnd}
                dragElastic={{ top: 0, bottom: 1 }}
                dragConstraints={{ top: 0, bottom: 0 }}
            >
                <div className={`py-3 overflow-y-auto flex flex-col h-full z-40 ${height != 'full' ? 'bg-level-1 border-t border-level-3 rounded-t-2xl ' : ''} pb-6`}>
                    <div className='px-6 flex justify-between items-center'>
                        <div className="text-lg text-foreground font-semibold">
                            <div>{title}</div>
                        </div>
                        <IconButton onClick={handleCloseModal} icon={
                            <X strokeWidth={3} />
                        }>
                        </IconButton>
                    </div>
                    <div className='select-text max-h-full overflow-y-auto styled-scroll px-6 h-full'>
                        {children}
                    </div>
                </div>
            </motion.div>
        </div>
    )
})

export default Leaflet
