import { useLoaderData } from '@remix-run/react'

import type { Network } from '@luxfi/core'

import SwapCard from '@/components/swap-card'
import backend from '@/domain/backend'
import useSetSettings from '@/contexts/use-set-settings'
import type { AppSettings } from '@/domain/types'

interface LoaderReturnType {
  settings: AppSettings,
  fromInitial?: Network,
  toInitial?: Network,
}

export const loader = async (): Promise<LoaderReturnType> => {

  const settings = await backend.getSettings()

  let fromInitial: Network | undefined
  let toInitial: Network | undefined
  if (settings) {

    const { networks } = settings
    //fromInitial = networks.find((el: Network) => (el.display_name === 'Base'))
    //toInitial = networks.find((el: Network) => (el.display_name === 'Ethereum'))

  }
  // otherwise an error is thrown

  return {
    settings: settings!,
    fromInitial: undefined,
    toInitial: undefined
  }

}

  // cf: https://remix.run/docs/en/main/route/should-revalidate#never-reloading-the-root
export const shouldRevalidate = () => false;

const Index: React.FC = () => {

  const { settings, fromInitial, toInitial } =  useLoaderData<LoaderReturnType>() as LoaderReturnType 

  useSetSettings( 
    settings,
    fromInitial,
    toInitial 
  )

  return ( <SwapCard className='w-[500px] h-[530px]' /> )
}
export default Index
