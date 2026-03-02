import { NextRequest, NextResponse } from 'next/server'
import { resolveTenant } from '@/lib/tenant'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  // Hostname from query param (client-side) or x-tenant header (set by middleware)
  const hostname =
    req.nextUrl.searchParams.get('hostname') ||
    req.headers.get('x-tenant-hostname') ||
    req.headers.get('host') ||
    'bridge.lux.network'

  const tenant = resolveTenant(hostname)

  return NextResponse.json(tenant, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  })
}
