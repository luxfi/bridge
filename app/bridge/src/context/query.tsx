'use client'

import {
  type Context,
  useContext,
  createContext,
  type PropsWithChildren,
} from 'react'
import { QueryParams } from '@/Models/QueryParams'
import { useSearchParams } from 'next/navigation'

export const QueryStateContext = createContext<QueryParams | null>(null)

const QueryProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const searchParams = useSearchParams()
  const query: QueryParams = {
    ...(searchParams.get('lockAddress') === 'true'
      ? { lockAddress: true }
      : {}),
    ...(searchParams.get('lockNetwork') === 'true'
      ? { lockNetwork: true }
      : {}),
    ...(searchParams.get('lockExchange') === 'true'
      ? { lockExchange: true }
      : {}),
    ...(searchParams.get('hideRefuel') === 'true' ? { hideRefuel: true } : {}),
    ...(searchParams.get('hideAddress') === 'true'
      ? { hideAddress: true }
      : {}),
    ...(searchParams.get('hideFrom') === 'true' ? { hideFrom: true } : {}),
    ...(searchParams.get('hideTo') === 'true' ? { hideTo: true } : {}),
    ...(searchParams.get('lockFrom') === 'true' ? { lockFrom: true } : {}),
    ...(searchParams.get('lockTo') === 'true' ? { lockTo: true } : {}),
    ...(searchParams.get('lockAsset') === 'true' ? { lockAsset: true } : {}),

    ...(searchParams.get('lockAddress') === 'false'
      ? { lockAddress: false }
      : {}),
    ...(searchParams.get('lockNetwork') === 'false'
      ? { lockNetwork: false }
      : {}),
    ...(searchParams.get('lockExchange') === 'false'
      ? { lockExchange: false }
      : {}),
    ...(searchParams.get('hideRefuel') === 'false'
      ? { hideRefuel: false }
      : {}),
    ...(searchParams.get('hideAddress') === 'false'
      ? { hideAddress: false }
      : {}),
    ...(searchParams.get('hideFrom') === 'false' ? { hideFrom: false } : {}),
    ...(searchParams.get('hideTo') === 'false' ? { hideTo: false } : {}),
    ...(searchParams.get('lockFrom') === 'false' ? { lockFrom: false } : {}),
    ...(searchParams.get('lockTo') === 'false' ? { lockTo: false } : {}),
    ...(searchParams.get('lockAsset') === 'false' ? { lockAsset: false } : {}),
  }
  return (
    <QueryStateContext.Provider value={mapLegacyQueryParams(query)}>
      {children}
    </QueryStateContext.Provider>
  )
}

function mapLegacyQueryParams(params: QueryParams): QueryParams {
  return {
    ...params,
    ...(params.sourceExchangeName ? { from: params.sourceExchangeName } : {}),
    ...(params.destNetwork ? { to: params.destNetwork } : {}),
    ...(params.lockExchange ? { lockFrom: params.lockExchange } : {}),
    ...(params.lockNetwork ? { lockTo: params.lockNetwork } : {}),
    ...(params.addressSource ? { appName: params.addressSource } : {}),
    ...(params.asset ? { toAsset: params.asset } : {}),
  }
}

export function useQueryState() {
  const data = useContext<QueryParams>(
    QueryStateContext as Context<QueryParams>
  )

  if (data === undefined) {
    throw new Error('useQueryState must be used within a QueryStateProvider')
  }

  return data
}

export default QueryProvider
