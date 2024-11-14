import React from 'react'
import defaultColors from "tailwindcss/colors"
import { ServerOff } from "lucide-react"

import { LinkElement } from "@luxdefi/ui/primitives"

const BrokenServerWithCircles: React.FC<{
  size: number
  bgColor: string 
  iconColor?: string
}> = ({
  size,
  bgColor,
  iconColor
}) => (
  <div className="inline-flex rounded-full relative color-inherit">
    <svg width={size} height={size} viewBox="0 0 116 116" fill={bgColor} >
      <circle cx="58" cy="58" r="58" fillOpacity="0.3" />
      <circle cx="58" cy="58" r="45" fillOpacity="0.5" />
      <circle cx="58" cy="58" r="30" />
    </svg>
    <ServerOff 
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fill: iconColor ?? 'currentColor' 
      }} 
      size={0.3 * size}  // experimentation
    />
  </div>
)

const Error500: React.FC = () => (
  <div className="flex h-full items-center justify-center p-5 w-full flex-1 text-foreground">
    <div className="text-center">
      <BrokenServerWithCircles size={200} bgColor={defaultColors.red[800]}/>
      <h1 className="mt-5 text-[36px] font-bold lg:text-[50px]">500 - Oops</h1>
      <p className="my-5 lg:text-lg">Something went wrong. Try refreshing this page or <br /> feel free to contact us if the problem presists.</p>
      <LinkElement 
          def={{
            href: 'https://help.lux.network', 
            title: 'Contact support',
            iconAfter: true,
            external: true,
            variant: 'outline',
            size: 'default'
          }}
          className="text-base lg:min-w-0 inline-flex font-sans"
        />

    </div>
  </div>
)

export default Error500
