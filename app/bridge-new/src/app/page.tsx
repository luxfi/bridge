import React  from 'react'
import { Footer, Main } from '@luxfi/ui'
import { ApplyTypography  } from '@hanzo/ui/primitives'

import Swapper from "@/components/Swapper"

import siteDef from '../site-def'

const UniversalPage = (/* { params, searchParams }: Props */) => (<>
  <Main className='md:flex-row md:gap-4 '>
    <ApplyTypography>
      <Swapper />
    </ApplyTypography>
  </Main>
  <Footer siteDef={siteDef} className='w-full pt-16 lg:mx-auto ' />
</>)

export default UniversalPage
