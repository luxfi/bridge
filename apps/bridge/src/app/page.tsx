import React  from 'react'

import { DrawerMargin, Header } from '@luxfi/ui'

import siteDef from '@/site-def'
import '@/blocks/registerComponents'

type Props = {
  searchParams?: { [key: string]: string | string[] | undefined }
}

const Page = ({ searchParams }: Props ) => {
    // see src/middleware.ts
  const agent = searchParams?.agent as string

  return (<>
    <Header siteDef={siteDef}/>
    <h1>BRIDGE</h1>
  </>)
}

export default Page
