import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion";

const variants = {
  enter: () => ({
    opacity: 0,
    y: '100%',
  }),
  center: () => ({
    opacity: 1,
    y: 0,
  }),
  exit: () => ({
    y: '100%',
    zIndex: 0,
    opacity: 0,
  }),
};
type VariantType = keyof typeof variants

type FooterProps = {
    hidden?: boolean,
    children?: JSX.Element | JSX.Element[];
    sticky?: boolean
}

const Footer = ({ children, hidden, sticky = true }: FooterProps) => {
    const [height, setHeight] = useState(0)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setHeight(Number(ref?.current?.clientHeight))
    }, [])

    const handleAnimationEnd = (variant: VariantType) => {
      if (variant === "center") {
        setHeight(Number(ref?.current?.clientHeight))
      }
    }
    return (
        sticky ?
            <>
                <motion.div
                    onAnimationComplete={handleAnimationEnd}
                    ref={ref}
                    transition={{
                        duration: 0.15,
                    }}
                    custom={{ direction: "back" ? -1 : 1, width: 100 }}
                    variants={variants}
                    className={`text-muted text-muted-primary-text text-base mt-3        
                        max-sm:fixed
                        max-sm:inset-x-0
                        max-sm:bottom-0 
                        max-sm:z-30
                        max-sm:bg-level-1 darkest-class 
                        max-sm:shadow-widget-footer 
                        max-sm:p-4 
                        max-sm:px-6 
                        max-sm:w-full ${hidden ? 'adnimation-slide-out' : ''}`}>
                    {children}
                </motion.div>
                
                <div style={{ height: `${height}px` }}
                    className={`text-muted text-muted-primary-text text-base mt-3        
                             max-sm:inset-x-0
                             max-sm:bottom-0 
                             max-sm:p-4 max-sm:w-full invisible sm:hidden`}>
                </div>
            </ >
            :
            <>
                {children}
            </>
    )
}
export default Footer;