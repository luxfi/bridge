import { useField, useFormikContext } from "formik"
import { ChangeEvent, FC, forwardRef } from "react"
import { SwapFormValues } from "../DTOs/SwapFormValues"
import { classNames } from '../utils/classNames'

type Input = {
    label?: React.ReactNode
    pattern?: string
    disabled?: boolean
    placeholder: string
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    precision?: number
    step?: number
    name: string
    className?: string
    children?: React.ReactNode
    ref?: any
    onChange?: (e: ChangeEvent<HTMLInputElement>) => void
}

const onInput = (event: React.ChangeEvent<HTMLInputElement>, precision: number) => { 
  replaceComma(event) 
  limitDecimalPlaces(event, precision) 
}


// Use with Formik
const NumericInput: FC<Input> = forwardRef<HTMLInputElement, Input>(
  (
    { 
      label, 
      pattern, 
      disabled, 
      placeholder, 
      min, 
      max, 
      minLength, 
      maxLength, 
      precision, 
      step, 
      name, 
      className, 
      children, 
      onChange 
    }, 
    ref
  ) => {

    const { handleChange } = useFormikContext<SwapFormValues>()
    const [field] = useField(name)

    return (
      <div className="flex flex-col">
        {label}
        <input
          {...field}
          pattern={pattern ? pattern : "^[0-9]*[.,]?[0-9]*$"}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          autoCorrect="off"
          min={min}
          max={max}
          minLength={minLength}
          maxLength={maxLength}
          onInput={(event: React.ChangeEvent<HTMLInputElement>) => { onInput(event, precision as number) }}
          type="text"
          step={step}
          name={name}
          id={name}
          ref={ref}
          className={classNames(
              'disabled:cursor-not-allowed h-12 leading-4 ' + 
              'text-muted placeholder:text-muted-2 bg-level-2 focus:ring-accent focus:border-accent ' +
              'border border-level-3 ' + 
              'flex-grow block w-full min-w-0 rounded-lg font-semibold ',
              className ?? ''
          )}
          onChange={onChange ? onChange : (e) => {
              /^[0-9]*[.,]?[0-9]*$/.test(e.target.value) && handleChange(e)
          }}
        />
        {children && (
          <span className="inline-flex items-center">
            {children}
          </span>
        )}
      </div>
    )
  }
)

function limitDecimalPlaces(e: React.ChangeEvent<HTMLInputElement>, count: number) {
    if (e.target.value.indexOf('.') == -1) { return }
    if ((e.target.value.length - e.target.value.indexOf('.')) > count) {
        e.target.value = ParseFloat(e.target.value, count).toString()
    }
}

function ParseFloat(str: string, val: number): number {
    str = str.toString()
    str = str.slice(0, (str.indexOf(".")) + val + 1)
    return Number(str)
}

function replaceComma(e: React.ChangeEvent<HTMLInputElement>) {
    var val = e.target.value
    if (val.match(/\,/)) {
        val = val.replace(/\,/g, '.')
        e.target.value = val
    }
}

export default NumericInput