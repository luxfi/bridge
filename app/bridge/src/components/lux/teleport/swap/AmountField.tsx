'use client'
import React from 'react'

import { cn } from '@hanzo/ui/util'

const PATTERN = '^[0-9]*[.,]?[0-9]*$'

const AmountField: React.FC<{
  disabled: boolean
  setValue?: (value: string) => void
  value: string
  className?: string
}> = ({ 
  disabled, 
  value, 
  setValue,
  className 
}) => {

    // No need to retest the pattern as we are blocking all other input via the pattern prop
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (setValue) {
      setValue(e.target.value)
    }
  }

  return (
    <input
      pattern={PATTERN}
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={'0.0'}
      autoCorrect="off"
      min={0}
      max={10000}
      type="text"
      value={value}
      step={0.01}
      name={'name'}
      id={'name'}
      className={cn(
        'outline-none px-1 py-0',
        'focus:ring-0 disabled:cursor-not-allowed h-hit',
        'leading-4 bg-level-1', 
        'placeholder:text-muted-3 focus:ring-foreground', 
        'block font-semibold ',
        className
      )}
      onChange={handleChange}
    />
  )
}

/* !disabled && (
  <div className="flex flex-col justify-center">
    <div className="text-xs flex flex-col items-center space-x-1 md:space-x-2 ml-2 md:ml-5 px-2">
      <div className="flex">
          <SecondaryButton onClick={() => {setValue && setValue(maxValue)}} size="xs" className="ml-1.5">
              MAX TOO
          </SecondaryButton>
      </div>
    </div>
  </div>
)*/


type AmountLabelProps = {
  detailsAvailable: boolean
  minAllowedAmount: number | undefined
  maxAllowedAmount: number | undefined
  isBalanceLoading: boolean
}
const AmountLabel = ({
  detailsAvailable,
  minAllowedAmount,
  maxAllowedAmount,
  isBalanceLoading,
}: AmountLabelProps) => {
  return (
    <div className="flex items-center w-full justify-between">
      <div className="flex items-center space-x-2">
        <p className="block font-semibold text-muted text-xs mb-1">Amount</p>
        {/* {
                detailsAvailable &&
                <div className="text-xs hidden md:flex  items-center">
                    <span>(Min:&nbsp;</span>{isBalanceLoading ? <span className="ml-1 h-3 w-6 rounded-sm bg-gray-500 animate-pulse" /> : <span>{minAllowedAmount}</span>}
                    <span>&nbsp;-&nbsp;Max:&nbsp;</span>{isBalanceLoading ? <span className="ml-1 h-3 w-6 rounded-sm bg-gray-500 animate-pulse" /> : <span>{maxAllowedAmount}</span>}<span>)</span>
                </div>
            } */}
      </div>
    </div>
  )
}

export default AmountField
