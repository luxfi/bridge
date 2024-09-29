import React from "react"
import { ChevronRight, ChevronLeft } from "lucide-react"

import { LinkElement } from '@luxdefi/ui/primitives'

const NotFound: React.FC = () => (
  <main className="grid min-h-full place-items-center px-6 py-24 sm:py-32 lg:px-8">
    <div className="text-center">
      <h1 className="mt-4 mb-3 text-3xl font-bold tracking-tight  sm:text-5xl">Page not found</h1>
      <p className="text-lg font-semibold">(404)</p>
      <p className="mt-6 text-lg leading-7">Sorry, we couldn’t find the page you’re looking for.</p>
      <div className="mt-10 flex items-center justify-center gap-x-4">
        <LinkElement 
          def={{
            href: '/', 
            title: 'Back to main page',
            icon: <ChevronLeft className="mr-2 h-4 w-4" /> ,
            variant: 'ghost',
            size: 'lg'
          }}
          className="text-base"
        />
        <LinkElement 
          def={{
            href: 'https://help.lux.network', 
            title: 'Contact support',
            icon: <ChevronRight className="ml-2 h-4 w-4" /> ,
            iconAfter: true,
            variant: 'ghost',
            size: 'lg'
          }}
          className="text-base"
        />
      </div>
    </div>
  </main>
)

export default NotFound
