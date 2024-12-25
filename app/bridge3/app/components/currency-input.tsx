import * as CurrencyInputExports from 'react-currency-input-field'

// cf: https://github.com/cchanxzy/react-currency-input-field/issues/335
const CurrencyInput =
  ('default' in CurrencyInputExports.default) ? 
    ((CurrencyInputExports.default as any).default as React.FC<CurrencyInputExports.CurrencyInputProps>)
    : 
    CurrencyInputExports.default

type CurrencyInputOnChangeValues = CurrencyInputExports.CurrencyInputOnChangeValues

export {
  CurrencyInput as default, 
  type CurrencyInputOnChangeValues
}