import React from 'react'
import { type LucideProps } from 'lucide-react'

const YouTubeLogo: React.FC<LucideProps> = (props: LucideProps) => (
  <svg 
    viewBox="0 0 256 256" 
    xmlns="http://www.w3.org/2000/svg" 
    {...props}
  >
    <g 
      style={{
        stroke: 'none',
        strokeWidth: 0,
        strokeDasharray: 'none',
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
        strokeMiterlimit: 10,
        fill: 'none',
        fillRule: 'nonzero',
        opacity: 1
      }}
      transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)" 
    >
      <path 
        d="M 88.119 23.338 c -1.035 -3.872 -4.085 -6.922 -7.957 -7.957 C 73.144 13.5 45 13.5 45 13.5 s -28.144 0 -35.162 1.881 c -3.872 1.035 -6.922 4.085 -7.957 7.957 C 0 30.356 0 45 0 45 s 0 14.644 1.881 21.662 c 1.035 3.872 4.085 6.922 7.957 7.957 C 16.856 76.5 45 76.5 45 76.5 s 28.144 0 35.162 -1.881 c 3.872 -1.035 6.922 -4.085 7.957 -7.957 C 90 59.644 90 45 90 45 S 90 30.356 88.119 23.338 z" 
        style={{
          stroke: 'none',
          strokeWidth: 1,
          strokeDasharray: 'none',
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
          strokeMiterlimit: 10,
          fill: 'red',
          fillRule: 'nonzero',
          opacity: 1
        }}
        transform=" matrix(1 0 0 1 0 0) " 
        strokeLinecap="round" 
      />
      <polygon 
        points="36,58.5 59.38,45 36,31.5 " 
        style={{
          stroke: 'none',
          strokeWidth: 1,
          strokeDasharray: 'none',
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
          strokeMiterlimit: 10,
          fill: 'white',
          fillRule: 'nonzero',
          opacity: 1
        }}
        transform="matrix(1 0 0 1 0 0)"
      />
    </g>
  </svg>
)

export default YouTubeLogo
