import React from 'react'

import { Combobox, type ComboboxTriggerProps, type ListAdaptor } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Asset } from '@luxfi/core'

const adaptor = {
  getValue:   (el: Asset): string => (el.asset),
  equals:     (el1: Asset, el2: Asset): boolean => (
    el1.asset.toUpperCase() === el2.asset.toUpperCase()
  ),
  valueEquals: (el: Asset, v: string): boolean => (
    el.asset.toUpperCase() === v.toUpperCase()
  ),
  getLabel:   (el: Asset): string => (el.name),
  getImageUrl: (el: Asset): string => (el.logo),

} satisfies ListAdaptor<Asset>

const AssetCombobox: React.FC<{
  assets: Asset[]
  asset: Asset | null
  setAsset: (Asset: Asset | null) => void
  placeholder?: string
  searchHint?: string
  disabled?: boolean
  buttonClx?: string 
  popoverClx?: string
  popoverAlign? : "center" | "end" | "start"
}> = ({
  assets, 
  asset, 
  setAsset,
  placeholder,
  searchHint,
  disabled=false,
  buttonClx='',
  popoverClx='',
  popoverAlign = 'center', 
}) => (

  <Combobox<Asset, ComboboxTriggerProps<Asset>>
    elements={assets}
    current={asset}
    setCurrent={setAsset}
    adaptor={adaptor}
    noCheckmark
    searchPlaceholder={searchHint}
    popoverClx={cn('font-sans font-medium w-full', popoverClx)}
    popoverAlign={popoverAlign}
    listItemClx='bg-background hover:!bg-level-3'
    listItemSelectedClx='!bg-level-2'
    triggerProps={{
      open: false,
      current: (asset ?? null),
      currentLabel: null,
      imageUrl: null,
      placeholder,
      imageClx: 'rounded',
      buttonClx: cn('font-sans font-medium w-auto pl-1.5 pr-2', buttonClx),
      disabled  
    }}
  />
)

export default AssetCombobox
