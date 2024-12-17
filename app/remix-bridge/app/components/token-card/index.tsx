import { useState } from 'react'

import type { Token } from '@/domain/types'
import { cn } from '@hanzo/ui/util'

import CurrencyInput, { type CurrencyInputOnChangeValues } from '../currency-input'
import TokenCombobox from '../token-combobox'

const TokenCard: React.FC<{
  tokens: Token[]
  token: Token | null
  setToken: (token: Token | null) => void
  usdValue: number | null // value of 1 in USD
  className?: string
}> = ({
  tokens,
  token,
  setToken,
  usdValue,
  className=''
}) => {

  const [_amount, _setAmount] = useState<number>(0)

    // component ensures a valid number string
  const onAmountChange = (
    value: string | undefined, 
    formatted?: string | undefined, 
    values?: CurrencyInputOnChangeValues | undefined
  ) => {
    _setAmount(value ? Number(value) : 0)
  }

  return (
    <div className={cn('border border-muted-4 py-2 pl-3 pr-1.5 has-[:focus]:border-muted', className)}>
      <div className='flex justify-between items-center gap-1'>
        <CurrencyInput 
          placeholder='0'
          decimalsLimit={2}
          onValueChange={onAmountChange}
          className={
            'min-w-0 text-foreground focus:text-accent bg-level-0 p-1 ' + 
            '!border-none focus:outline-none text-xl !placeholder-muted-3'
          }
        />
        <TokenCombobox 
          tokens={tokens}
          token={token}
          setToken={setToken}
          buttonClx='shrink-0 border-none'
          popoverAlign='end'
        />
      </div>
      { _amount > 0 && usdValue && (
        <CurrencyInput 
          readOnly
          prefix='$'
          decimalsLimit={2}
          value={_amount * usdValue}
          className={
            'cursor-default text-muted bg-level-0 ' + 
            '!border-none focus:outline-none text-sm'
          }
        />                
      )}
    </div>
  )
}


export default TokenCard
