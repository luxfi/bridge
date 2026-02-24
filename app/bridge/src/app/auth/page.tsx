import nextDynamic from 'next/dynamic'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const AuthContent = nextDynamic(() => import('@/components/AuthContent'), { ssr: false })

export default function AuthPage() {
  return <AuthContent />
}
