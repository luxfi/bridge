'use client'
import { type PropsWithChildren } from "react";
import { useMeasure } from "@uidotdev/usehooks";
import { AnimatePresence, motion } from "framer-motion";

const ResizablePanel: React.FC<{ 
  className?: string 
} & PropsWithChildren> = ({ 
  children, 
  className 
}) => {
  let [ref, { height }] = useMeasure()

  return (
    <motion.div animate={{ height: height || "auto" }} className="relative overflow-hidden" >
      <AnimatePresence initial={false}>
        <motion.div
          initial={{ x: 382 }}
          animate={{ x: 0 }}
          exit={{ x: -382 }}
        >
          <div
            ref={ref}
            className={`${className}`}
          >
            {children}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

export default ResizablePanel
