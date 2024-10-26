import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import resolvePersistantQueryParams from '../util/resolvePersisitentQueryParams'

export const useGoHome = (): (() => Promise<void>) => {

  const params = useSearchParams()
  const router = useRouter()
  const paramsString = resolvePersistantQueryParams(params).toString()

  return useCallback(async () => {
    return await router.push(`/${paramsString ? '?/' + paramsString : ''}`)
  }, [paramsString])
}