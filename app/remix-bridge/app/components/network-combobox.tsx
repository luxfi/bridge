import React from 'react'

import { Button, Combobox, type ComboboxTriggerProps, type ListAdaptor } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Network } from '@/domain/types'

const ICON_SIZE = 32

const adaptor = {
  getValue:   (el: Network): string => (el.internal_name),
  equals:     (el1: Network, el2: Network): boolean => (
    el1.internal_name.toUpperCase() === el2.internal_name.toUpperCase()
  ),
  valueEquals: (el: Network, v: string): boolean => (
    el.internal_name.toUpperCase() === v.toUpperCase()
  ),
  getLabel:  (el: Network): string => (el.display_name),
  getImageUrl:  (el: Network): string => (el.logo),

} satisfies ListAdaptor<Network>


const NetworkComboboxTriggerInner = <Network, >({
  current,
  currentLabel,
  imageUrl,
  buttonClx,
  imageClx,
  imageSize,
  ...rest
}: ComboboxTriggerProps<Network>,
  ref: React.ForwardedRef<HTMLButtonElement>
) => (
  <Button
    ref={ref}
    {...rest}
    variant='outline'
    role='combobox'
    className={cn('flex justify-start', buttonClx)}
  >
    <div className='flex justify-start items-center gap-2'>
    {current ? (
      <img
        src={imageUrl!}
        alt={currentLabel + ' image'}
        height={ICON_SIZE}
        width={ICON_SIZE}
        loading="eager"
        className={imageClx}
      />
    ) : (
      <div style={{width: imageSize, height: imageSize}} />
    )}
      <span>{ currentLabel ?? '(select)' }</span>
    </div>
  </Button>
)

const NetworkComboboxTrigger = React.forwardRef(NetworkComboboxTriggerInner) as <Network>(props: ComboboxTriggerProps<Network> & { ref?: React.ForwardedRef<HTMLButtonElement> }) => ReturnType<typeof NetworkComboboxTriggerInner>


const NetworkCombobox: React.FC<{
  networks: Network[]
  network?: Network
  setNetwork: (network: Network) => void
  searchHint?: string
  popoverClx?: string
  buttonClx?: string
  popoverAlign? : "center" | "end" | "start"
}> = ({
  networks, 
  network, 
  setNetwork,
  searchHint,
  popoverClx='',
  popoverAlign = 'center', 
  buttonClx=''
}) => (

  <Combobox<Network>
    elements={networks}
    adaptor={adaptor}
    initial={network}
    elementSelected={setNetwork}
    searchPlaceholder={searchHint}
    popoverClx={cn('font-sans font-medium w-full', popoverClx)}
    popoverAlign={popoverAlign}
    Trigger={NetworkComboboxTrigger}
    triggerProps={{
      open: false,
      current: (network ?? null),
      currentLabel: null,
      imageUrl: null,
      buttonClx: cn('font-sans font-medium w-full pl-1.5 pr-2', buttonClx),
      disabled: false  
    }}
  />
)

export default NetworkCombobox
