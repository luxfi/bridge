import { useLoaderData } from '@remix-run/react'
import { typedjson } from 'remix-typedjson'

import type { Network } from '@luxfi/core'

import SwapCard from '@/components/swap-card'
import backend from '@/domain/backend'
import useSetSettings from '@/contexts/use-set-settings'

export const loader = async () => {

  const settings = await backend.getSettings()

  let fromInitial: Network | undefined
  let toInitial: Network | undefined
  if (settings) {

    const { networks } = settings
    fromInitial = networks.find((el: Network) => (el.display_name === 'Base'))
    toInitial = networks.find((el: Network) => (el.display_name === 'Ethereum'))

  }
  // otherwise an error is thrown

    return typedjson({
      settings,
      fromInitial,
      toInitial
    })

}

  // cf: https://remix.run/docs/en/main/route/should-revalidate#never-reloading-the-root
export const shouldRevalidate = () => false;

const Index: React.FC = () => {

  const { settings, fromInitial, toInitial } = useLoaderData<typeof loader>()
  useSetSettings( 
    settings,
    fromInitial,
    toInitial 
  )

  return ( <SwapCard className='w-[500px] h-[530px]' /> )
}
export default Index
