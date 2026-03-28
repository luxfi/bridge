'use client'

import Link from "next/link"
import { useEffect, useState } from "react"
import type { TenantConfig } from "@/lib/tenant"

/**
 * Global footer — all links derived from IAM org tenant config.
 * Zero hardcoded brand URLs.
 */
const GlobalFooter = () => {
  const [tenant, setTenant] = useState<TenantConfig | null>(null)

  useEffect(() => {
    fetch('/api/tenant')
      .then((r) => r.json())
      .then(setTenant)
      .catch(() => {})
  }, [])

  const docsUrl = tenant?.docsUrl || ''
  const privacyUrl = docsUrl ? `${docsUrl}/privacy-policy` : ''
  const termsUrl = docsUrl ? `${docsUrl}/terms-of-service` : ''

  return (
    <footer className="text-muted-2 z-0 hidden md:flex fixed bottom-0 py-4 justify-between items-center w-full px-6 lg:px-8 mt-auto">
      <div>
        {(privacyUrl || termsUrl) && (
          <div className="flex mt-3 md:mt-0 gap-6">
            {privacyUrl && (
              <Link target="_blank" href={privacyUrl} className="text-xs leading-6 underline hover:no-underline hover:text-foreground duration-200 transition-all">
                Privacy Policy
              </Link>
            )}
            {termsUrl && (
              <Link target="_blank" href={termsUrl} className="text-xs leading-6 underline hover:no-underline hover:text-foreground duration-200 transition-all">
                Terms of Service
              </Link>
            )}
          </div>
        )}
        <p className="text-center text-xs text-muted-2 leading-6">
          &copy; {new Date().getFullYear()} {tenant?.name || ''} All rights reserved.
        </p>
      </div>
    </footer>
  )
}

export default GlobalFooter
