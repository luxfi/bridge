import React from 'react'

import { Combobox, type ComboboxTriggerProps, type ListAdaptor } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Token } from '@/domain/types'

const adaptor = {
  getValue:   (el: Token): string => (el.asset),
  equals:     (el1: Token, el2: Token): boolean => (
    el1.asset.toUpperCase() === el2.asset.toUpperCase()
  ),
  valueEquals: (el: Token, v: string): boolean => (
    el.asset.toUpperCase() === v.toUpperCase()
  ),
  getLabel:  (el: Token): string => (el.name),
  getImageUrl:  (el: Token): string => (el.logo),

} satisfies ListAdaptor<Token>

const TokenCombobox: React.FC<{
  tokens: Token[]
  token: Token | null
  setToken: (token: Token | null) => void
  placeholder?: string
  searchHint?: string
  disabled?: boolean
  buttonClx?: string 
  popoverClx?: string
  popoverAlign? : "center" | "end" | "start"
}> = ({
  tokens, 
  token, 
  setToken,
  placeholder,
  searchHint,
  disabled=false,
  buttonClx='',
  popoverClx='',
  popoverAlign = 'center', 
}) => (

  <Combobox<Token, ComboboxTriggerProps<Token>>
    elements={tokens}
    current={token}
    setCurrent={setToken}
    adaptor={adaptor}
    noCheckmark
    searchPlaceholder={searchHint}
    popoverClx={cn('font-sans font-medium w-full', popoverClx)}
    popoverAlign={popoverAlign}
    listItemClx='bg-background hover:!bg-level-3'
    listItemSelectedClx='!bg-level-2'
    triggerProps={{
      open: false,
      current: (token ?? null),
      currentLabel: null,
      imageUrl: null,
      placeholder,
      imageClx: 'rounded',
      buttonClx: cn('font-sans font-medium w-auto pl-1.5 pr-2', buttonClx),
      disabled  
    }}
  />
)

export default TokenCombobox
