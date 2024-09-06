import React, { useEffect } from "react"
import { ChevronLeft } from "lucide-react"

import { LinkElement } from "@luxdefi/ui/primitives"

import MessageComponent from "../components/MessageComponent"
import Navbar from "../components/navbar"

const Custom404: React.FC = () => {

  useEffect(() => {
    plausible("404", { props: { path: document.location.pathname } })
  }, [])

  return (
    <div className="styled-scroll">
      <main className="styled-scroll">
        <div className="min-h-screen overflow-hidden relative font-robo">
          <Navbar />
          <div className="mx-auto max-w-xl md:shadow-card rounded-lg w-full overflow-hidden relative px-6 py-6 h-[500px] min-h-[550px]">
            <MessageComponent >
              <MessageComponent.Content icon="red" >
                <div className="text-center text-foreground">
                  <p className="text-base font-semibold ">404</p>
                  <h1 className="mt-2 text-4xl font-bold tracking-tight  sm:text-5xl">Page not found.</h1>
                  <p className="mt-2 text-base ">Sorry, we couldn&apos;t find the page you&apos;re looking for.</p>
                </div>
              </MessageComponent.Content>
              <MessageComponent.Buttons>
                <LinkElement 
                  def={{
                    href: '/', 
                    title: 'Back to main page',
                    icon: <ChevronLeft className="mr-2 h-4 w-4" /> ,
                    variant: 'ghost',
                    size: 'lg'
                  }}
                  className="text-base "
                />
              </MessageComponent.Buttons>
            </MessageComponent>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Custom404
