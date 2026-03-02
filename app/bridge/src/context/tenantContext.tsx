'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ResolvedTenant } from '@/lib/tenant'

interface TenantContextValue {
  tenant: ResolvedTenant | null
  loading: boolean
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
})

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<ResolvedTenant | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hostname = window.location.hostname
    fetch(`/api/tenant?hostname=${encodeURIComponent(hostname)}`)
      .then((r) => r.json())
      .then((data) => {
        setTenant(data)
        // Apply CSS custom properties for white-label theming
        if (data.primaryColor) {
          document.documentElement.style.setProperty('--brand-primary', data.primaryColor)
        }
        if (data.accentColor) {
          document.documentElement.style.setProperty('--brand-accent', data.accentColor)
        }
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false))
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}

/** Server-side tenant resolution helper for layout.tsx */
export async function fetchTenantServer(hostname: string): Promise<ResolvedTenant | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    const res = await fetch(
      `${baseUrl}/api/tenant?hostname=${encodeURIComponent(hostname)}`,
      { next: { revalidate: 60 } }
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
