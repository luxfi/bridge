import React from 'react'

import { ChevronRight } from "lucide-react"

import { LinkElement } from '@luxdefi/ui/primitives'

import BackButton from "@/components/buttons/BackButton"

const NotFound: React.FC = () => (
  <section>
    <div className="px-6 py-12 mx-auto">
      <div className="flex flex-col justify-center items-center">
        <h2 className="my-3 text-2xl font-semibold  md:text-3xl">Huh?</h2>
        <p className="text-lg font-medium text-priamry-text">We can’t find that.</p>
        <h1 className="mt-3 text-2xl font-semibold  md:text-3xl">If you think it’s a mistake, contact us</h1>

        <div className="flex flex-row items-center mt-6 gap-x-3">
          <BackButton />
          <LinkElement 
            def={{
              href: 'https://help.lux.network', 
              title: 'Contact support',
              icon: <ChevronRight className="ml-2 h-4 w-4" /> ,
              iconAfter: true,
              external: true,
              variant: 'ghost',
              size: 'lg'
            }}
            className="text-base"
          />
        </div>
      </div>
    </div>
  </section>
)

export default NotFound

