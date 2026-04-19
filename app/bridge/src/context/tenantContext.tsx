import React, { createContext, useContext, useEffect, useState } from 'react'
import { fetchTenant, getTenant, type TenantConfig } from '@/lib/tenant'

interface TenantContextValue {
  tenant: TenantConfig | null
  loading: boolean
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
})

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig | null>(() => getTenant())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchTenant()
      .then((data) => {
        if (cancelled) return
        setTenant(data)
        if (data.primaryColor) {
          document.documentElement.style.setProperty('--brand-primary', data.primaryColor)
        }
      })
      .catch(() => {
        /* use fallback */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <TenantContext.Provider value={{ tenant, loading }}>{children}</TenantContext.Provider>
}

export function useTenant() {
  return useContext(TenantContext)
}
