'use client'
import { useEffect, type PropsWithChildren } from 'react'

import { motion, type Variants } from 'framer-motion';
import { useFormWizardaUpdate, useFormWizardState } from '../../context/formWizardProvider';
import { type Steps } from '../../Models/Wizard';

const WizardItem: React.FC<{
  StepName: Steps,
  PositionPercent?: number,
  GoBack?: () => void,
  fitHeight?: boolean
} & PropsWithChildren> = (({ 
  StepName, 
  children, 
  GoBack, 
  PositionPercent, 
  fitHeight = false 
}) => {

    const { currentStepName, wrapperWidth, moving } = useFormWizardState()
    const { setGoBack, setPositionPercent } = useFormWizardaUpdate()
    const styleConfigs = fitHeight ? { width: `${wrapperWidth}px`, height: '100%' } : { width: `${wrapperWidth}px`, minHeight: '534px', height: '100%' }

    useEffect(() => {
      if (currentStepName === StepName) {
        GoBack && setGoBack(GoBack)
        PositionPercent && setPositionPercent(PositionPercent)
      }
    }, [currentStepName, GoBack, PositionPercent, StepName, setGoBack, setPositionPercent])

    return currentStepName === StepName ?
        <motion.div
            whileInView="done"
            key={currentStepName as string}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
                x: { duration: 0.35, type: "spring" },
            }}
            custom={{ direction: moving === "back" ? -1 : 1, width: wrapperWidth }}>
            <div style={styleConfigs} className="pb-6">
                {Number(wrapperWidth) > 1 && children}
            </div>
        </motion.div>
        : null
})

let variants = {
    enter: ({ direction, width }) => ({
        x: direction * width,
    }),
    center: {
        x: 0,
        transition: {
            when: "beforeChildren",
        },
    },
    exit: ({ direction, width }) => ({
        x: direction * -width,
    }),
} satisfies Variants

export default WizardItem;