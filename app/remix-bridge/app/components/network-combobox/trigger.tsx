import React from 'react'

import { Button, type ComboboxTriggerProps } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Network } from '@/domain/types'

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
    className={cn('flex justify-start', buttonClx)}
  >
    <div className='flex justify-start items-center gap-2'>
      {label}
    {current ? (
      <img
        src={imageUrl!}
        alt={currentLabel + ' image'}
        height={imageSize}
        width={imageSize}
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

const NetworkComboboxTrigger =  React.forwardRef(NetworkComboboxTriggerInner) as <Network, NetworkTriggerProps>(props: NetworkTriggerProps & { ref?: React.ForwardedRef<HTMLButtonElement> }) => React.ReactNode

export {
  NetworkComboboxTrigger as default, 
  type NetworkTriggerProps
}
