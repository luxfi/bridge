import React from 'react'
import Image, { type ImageProps } from 'next/image'

// XRP Ledger icon for wallet display
// XRP Ledger icon for wallet display
export default function XRPLIcon(props: Omit<ImageProps, 'src' | 'alt'>) {
  return (
    <Image
      src="/assets/img/xrp.svg"
      alt="XRP Ledger"
      width={24}
      height={24}
      {...props}
    />
  )
}