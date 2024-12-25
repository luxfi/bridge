import React from 'react'

import { Button, type ComboboxTriggerProps } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Network } from '@luxfi/core'

interface NetworkTriggerProps extends ComboboxTriggerProps<Network>{
  label: string
  rightJustified?: boolean
}

const NetworkComboboxTriggerInner = ({
  current,
  currentLabel,
  imageUrl,
  buttonClx,
  imageClx,
  imageSize,
  rightJustified=false,
  label,
  ...rest
}: NetworkTriggerProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) => (
  <Button
    ref={ref}
    {...rest}
    variant='outline'
    role='combobox'
    className={cn(
      'flex gap-1.5 rounded-lg h-auto py-1', 
      rightJustified ? 'justify-start flex-row-reverse' : 'justify-start',
      buttonClx
    )}
  >
    {current ? (
      <img
        src={imageUrl!}
        alt={currentLabel + ' image'}
        height={imageSize}
        width={imageSize}
        loading="eager"
        className={cn('block rounded-md ', imageClx)}
      />
    ) : (
      <div style={{width: imageSize, height: imageSize}} />
    )}
    <div className={cn(
      'flex flex-col gap-0 ',
      rightJustified ? 'justify-end items-end' : 'justify-start items-start' 
    )}>
      <span className='text-sm block text-muted-2'>{label}</span>
      <span className={cn('block font-semibold', currentLabel ? 'text-foreground' : 'text-muted')}>{ currentLabel ?? '(select)' }</span>
    </div>
  </Button>
)

const NetworkComboboxTrigger =  React.forwardRef(NetworkComboboxTriggerInner) as <Network, NetworkTriggerProps>(props: NetworkTriggerProps & { ref?: React.ForwardedRef<HTMLButtonElement> }) => React.ReactNode

export {
  NetworkComboboxTrigger as default, 
  type NetworkTriggerProps
}
