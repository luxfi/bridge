/**
 * Shim for `@sentry/nextjs` — forwards to `@sentry/browser` in the SPA.
 * Provides the subset of API our code uses (captureException, configureScope,
 * startTransaction). Avoids pulling the full Next.js integration.
 */
import * as Sentry from '@sentry/browser'

export const captureException = Sentry.captureException
export const configureScope = (cb: (scope: Sentry.Scope) => void) => {
  const scope = Sentry.getCurrentScope()
  cb(scope)
}
export const startTransaction = (_ctx: { name: string }) => ({
  finish: () => {},
  setData: (_k: string, _v: unknown) => {},
})
export default Sentry
