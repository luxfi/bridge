import { type LucideProps } from 'lucide-react'

const FailIcon = (props: LucideProps) => (
  <svg width="116" height="116" viewBox="0 0 116 116" fill="none" {...props} >
      <circle cx="58" cy="58" r="58" fill="#E43636" fillOpacity="0.1" />
      <circle cx="58" cy="58" r="45" fill="#E43636" fillOpacity="0.5" />
      <circle cx="58" cy="58" r="30" fill="#E43636" />
      <path d="M48 69L68 48" stroke="white" strokeWidth="3.15789" strokeLinecap="round" />
      <path d="M48 48L68 69" stroke="white" strokeWidth="3.15789" strokeLinecap="round" />
  </svg>
)

export default FailIcon
