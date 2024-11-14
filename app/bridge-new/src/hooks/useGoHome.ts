import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import resolvePersistentQueryParams from '../util/resolvePersistentQueryParams'

export const useGoHome = (): (() => Promise<void>) => {

  const params = useSearchParams()
  const router = useRouter()
  const paramsString = resolvePersistentQueryParams(params).toString()

  return useCallback(async () => {
    return await router.push(`/${paramsString ? '?/' + paramsString : ''}`)
  }, [paramsString])
}