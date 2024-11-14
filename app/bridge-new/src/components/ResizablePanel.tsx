"use client";
import { type PropsWithChildren } from "react";
import { useMeasure } from "@uidotdev/usehooks";
import { AnimatePresence, motion } from "framer-motion";

function ResizablePanel({
  children,
  className,
}  : {
  className?: string;
} & PropsWithChildren) {
  let [ref, { height }] = useMeasure();

  return (
    <motion.div
      animate={{ height: height || "auto" }}
      className="relative overflow-hidden"
    >
      <AnimatePresence initial={false}>
        {/* <motion.div
          key={JSON.stringify(children, ignoreCircularReferences())}
          initial={{
            x: 382,
          }}
          animate={{
            x: 0,
          }}
          exit={{
            x: -382,
          }}
        > */}
        <div ref={ref} className={`${className}`}>
          {children}
        </div>
        {/* </motion.div> */}
      </AnimatePresence>
    </motion.div>
  );
}

export default ResizablePanel
