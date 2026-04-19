import { lazy, Suspense } from 'react'

const AuthContent = lazy(() => import('@/components/AuthContent'))

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthContent />
    </Suspense>
  )
}
