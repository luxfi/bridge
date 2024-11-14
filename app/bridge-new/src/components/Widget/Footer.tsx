'use client'
import { motion, type AnimationDefinition } from "framer-motion";
import { useEffect, useRef, useState } from "react"
import ReactPortal from "../Common/ReactPortal";


const variants = {
    enter: () => {
        return ({
            opacity: 0,
            y: '100%',
        })
    },
    center: () => {
        return ({
            opacity: 1,
            y: 0,
        })
    },
    exit: () => {
        return ({
            y: '100%',
            zIndex: 0,
            opacity: 0,
        })
    },
};

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

    const handleAnimationEnd = (variant: AnimationDefinition) => {
        if (variant == "center") {
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
                    custom={{ 
                      direction: -1, //"back" ? -1 : 1, // :aa wtf? 
                      width: 100 
                    }}
                    variants={variants}
                    className={` text-base mt-3        
                        max-sm:fixed
                        max-sm:inset-x-0
                        max-sm:bottom-0 
                        max-sm:z-30
                        max-sm:bg-background 
                        max-sm:shadow-widget-footer 
                        max-sm:p-4 
                        max-sm:px-6 
                        max-sm:w-full ${hidden ? 'adnimation-slide-out' : ''}`}>
                    {children}
                </motion.div>
                
                <div style={{ height: `${height}px` }}
                    className={` text-base mt-3        
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