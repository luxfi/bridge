import React from 'react'

const MIN = 0
const MAX = 10000
const PLACEHOLDER = '0.0' 
const STEP = 0.01
const PATTERN = '^[0-9]*[.,]?[0-9]*$'

//       className="rounded-r-none outline-none w-full pl-0.5 p-0 focus:ring-0 disabled:cursor-not-allowed h-hit leading-4 bg-level-1 shadow-sm placeholder:text-muted-3 focus:ring-foreground focus:border-foreground block min-w-0 rounded-lg font-semibold border-0"

const DecimalInput: React.FC<{
  value: string
  disabled?: boolean
  setValue?: (value: string) => void
  className?: string
}> = ({ 
  disabled=false,
  className='', 
  setValue, 
  value 
}) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    const regexp = new RegExp(PATTERN) 
    if (regexp.test(e.target.value) && setValue) {
      setValue(e.target.value)
    }
  }

  return (
    <input
      className={className}
      pattern={PATTERN}
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={PLACEHOLDER}
      autoCorrect="off"
      min={MIN}
      max={MAX}
      type="text"
      value={value}
      step={STEP}
      onChange={handleChange}
    />
  )
}

export default DecimalInput
