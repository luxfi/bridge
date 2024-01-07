import { useFormikContext } from "formik"
import { forwardRef } from "react"
import { SwapFormValues } from "../DTOs/SwapFormValues"
import NumericInput from "./NumericInput"
import dynamic from "next/dynamic"

const Label: React.FC<{
  label: string
  htmlFor: string
}> = ({
  label,
  htmlFor
}) => (
  <div className="w-full flex flex-row items-center space-x-2 pb-2">
    <label className='block font-semibold text-foreground text-sm' htmlFor={htmlFor}>{label}</label>
  </div>
)

const EnhancedAmountField = dynamic(() => import("./EnhancedAmount"), {
  loading: () => (
    <NumericInput
      label={<Label label='Amount' htmlFor='amount' />}
      disabled={true}
      placeholder='0.01234'
      name="amount"
      className='rounded-r-none text-foreground py-3 '
    />
  )
})

const AmountField = forwardRef(function AmountField(_, ref: any) {

  const { values } = useFormikContext<SwapFormValues>()
  const { from, to } = values
  const name = "amount"

  if (!from || !to) {
    return (
      <NumericInput
        label={<Label label='Amount' htmlFor='amount' />}
        disabled={true}
        placeholder='0.01234'
        name={name}
      />
    )
  }

  return <EnhancedAmountField />
})


export default AmountField