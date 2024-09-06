'use client'
import { useEffect, useState } from "react";

import { LinkElement } from "@luxdefi/ui/primitives";

import MessageComponent from "./MessageComponent";
import inIframe from "./utils/inIframe";

const NoCookies: React.FC = () => {

  const [embedded, setEmbedded] = useState<boolean>()

  useEffect(() => {
    setEmbedded(inIframe())
  }, [])

  return (
    <div className="styled-scroll">
      <div className="min-h-screen overflow-hidden relative ">
        <div className="mx-auto max-w-xl shadow-card rounded-lg w-full overflow-hidden relative px-0 md:px-8 py-6 h-[500px] min-h-[550px]">
          <MessageComponent>
            <MessageComponent.Content icon="red">
                <MessageComponent.Header>
                    Sorry
                </MessageComponent.Header>
                <MessageComponent.Description>
                    <div className=" space-y-5 text-left">
                        <div className="space-y-2">
                            <p className="">
                                It seems like you’ve either:
                            </p>
                            <ul className=" list-disc ml-4 mt-0 ">
                                <li>Disabled cookies</li>
                                <li>Or using Bridge in a partner’s page in Incognito mode</li>
                            </ul>
                        </div>
                        <p >Unforunately, we can’t run in those conditions 🙁</p>
                    </div>
                    {embedded && (
                      <LinkElement
                        def={{
                          href: window?.location?.href,
                          title: 'Try on Bridge',
                          variant: 'primary',
                          size: 'default'
                        }}
                        className='font-semibold font-sans'
                      />
                    )}
                </MessageComponent.Description>
            </MessageComponent.Content>
          </MessageComponent>
        </div>
      </div>
    </div >
  )
}

export default NoCookies
