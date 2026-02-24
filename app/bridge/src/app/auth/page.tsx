import dynamic from 'next/dynamic'

export const revalidate = 0

const AuthContent = dynamic(() => import('@/components/AuthContent'), { ssr: false })

export default function AuthPage() {
  return <AuthContent />
}
