/**
 * Vite SPA shim for `next/server`.
 * The SPA has no server runtime; these exports exist so any lingering
 * module-level imports type-check and compile. Calling them throws.
 */
export class NextRequest extends Request {}

export const NextResponse = {
  json: (_body: unknown, _init?: ResponseInit): Response => {
    throw new Error('NextResponse.json is not available in the SPA')
  },
  redirect: (_url: string | URL, _status?: number): Response => {
    throw new Error('NextResponse.redirect is not available in the SPA')
  },
  next: (): Response => {
    throw new Error('NextResponse.next is not available in the SPA')
  },
}
