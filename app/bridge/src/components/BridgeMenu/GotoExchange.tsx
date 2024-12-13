'use client'
import { cn } from '@hanzo/ui/util'
import { ArrowUpRight } from 'lucide-react'
import Image from 'next/image'
import React from 'react'

interface IProps {
  className?: string
}

const GotoExchange: React.FC<IProps> = ({ className }) => (
  <div className={cn(className, 'w-full pb-4')}>
    <div
      onClick={() => window.open('https://lux.exchange/#/swap', '_self')}
      className="flex w-full justify-between gap-3 bg-level-1 p-3 rounded-xl hover:opacity-70 cursor-pointer"
    >
      <div className="flex gap-3">
        <div className="flex items-center">
          <Image
            src={'https://cdn.lux.network/bridge/networks/lux_mainnet.png'}
            width={30}
            height={30}
            alt="avatar"
            className="rounded-full flex-none"
          />
        </div>
        <div className="flex flex-col">
          <h3 className="text-lg">Lux Exchange</h3>
          <h3 className="text-sm hidden sm:inline">Trade over $3.1 trillion dollars worth of digital assets on LX</h3>
        </div>
      </div>
      <div className="flex items-center">
        <ArrowUpRight width={20} height={20} />
      </div>
    </div>
  </div>
)

export default GotoExchange
