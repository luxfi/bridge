import { NextRequest, NextResponse } from 'next/server'
import { fetchTenant } from '@/lib/tenant'

export const runtime = 'edge'

/**
 * GET /api/tenant — returns tenant config derived from IAM org.
 * Client-side components call this to get branding (name, logo, colors).
 * Cached for 60s at edge, revalidates via IAM every 5 min server-side.
 */
export async function GET(_req: NextRequest) {
  const tenant = await fetchTenant()

  return NextResponse.json(tenant, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  })
}
