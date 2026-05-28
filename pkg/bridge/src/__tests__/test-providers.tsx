// Shared React-Query / Wagmi wrapper for renderHook tests.
//
// useNetworks (consumed transitively by useSwap and useTransfers) calls
// useQuery, which requires a QueryClientProvider in the render tree.
// Production wiring lives in BridgeApp.tsx; tests need their own.
//
// retry: false + gcTime: 0 so failed fetches don't spend the test budget
// retrying, and the cache is dropped between tests for isolation.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FC, ReactNode } from 'react'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  })
}

/**
 * Build a fresh wrapper per test. Important: the returned component is a
 * new closure every call, so React-Query won't share cache across tests
 * unless the caller deliberately reuses one instance.
 */
export function makeTestWrapper(): FC<{ children: ReactNode }> {
  const queryClient = createTestQueryClient()
  const Wrapper: FC<{ children: ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}
