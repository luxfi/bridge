import React from 'react'
import Image from 'next/image'

// XRP Ledger icon for wallet display
export default function XRPLIcon(props: React.ComponentProps<typeof Image>) {
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