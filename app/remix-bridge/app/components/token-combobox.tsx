import React from 'react'

import { Combobox, type ListAdaptor } from '@hanzo/ui/primitives-common'
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
  token?: Token
  setToken: (token: Token) => void
  placeholder?: string
  searchHint?: string
  disabled?: boolean
  buttonClx?: string 
  popoverClx?: string
}> = ({
  tokens, 
  token, 
  setToken,
  placeholder,
  searchHint,
  disabled=false,
  buttonClx='',
  popoverClx='',
}) => (

  <Combobox<Token>
    elements={tokens}
    adaptor={adaptor}
    initial={token}
    elementSelected={setToken}
    buttonPlaceholder={placeholder}
    searchPlaceholder={searchHint}
    buttonClx={cn('font-sans font-medium w-full pl-1.5 pr-2', buttonClx)}
    popoverClx={cn('font-sans font-medium w-full', popoverClx)}
    disabled={disabled}
  />
)

export default TokenCombobox
