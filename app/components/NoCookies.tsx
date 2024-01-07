import React, { useEffect, useState } from "react"
import MessageComponent from "./MessageComponent"
import inIframe from "./utils/inIframe"
import Link from "next/link"

const NoCookies: React.FC = () => {
    const [embedded, setEmbedded] = useState<boolean>()

    useEffect(() => {
        setEmbedded(inIframe())
    }, [])

    return (
        <div className="styled-scroll">
            <div className="min-h-screen overflow-hidden relative font-robo">
                <div className="mx-auto max-w-xl bg-level-1 darkest-class shadow-card rounded-lg w-full overflow-hidden relative px-0 md:px-8 py-6 h-[500px] min-h-[550px]">
                    <MessageComponent>
                        <MessageComponent.Content icon="red">
                            <MessageComponent.Header>
                                Sorry
                            </MessageComponent.Header>
                            <MessageComponent.Description>
                                <div className="text-foreground text-foreground-new space-y-5 text-left">
                                    <div className="space-y-2">
                                        <p className="text-muted text-muted-primary-text">
                                            It seems like you’ve either:
                                        </p>
                                        <ul className="text-foreground text-foreground-new list-disc ml-4 mt-0 ">
                                            <li>Disabled cookies</li>
                                            <li>Or using Bridge in a partner’s page in Incognito mode</li>
                                        </ul>
                                    </div>
                                    <p className="text-foreground text-foreground-new">Unforunately, we can’t run in those conditions 🙁</p>
                                </div>
                                {
                                    embedded &&
                                    <Link target="_blank" href={window?.location?.href} className="bg-primary text-primary-buttonTextColor py-3 px-3 border border-primary disabled:border-primary-900 shadowed-button items-center space-x-1 disabled:text-opacity-40 disabled:bg-primary-900 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md shadow-md hover:shadow-xl transform hover:-translate-y-0.5 transition duration-200 ease-in-out">
                                        Try on Bridge
                                    </Link>
                                }
                            </MessageComponent.Description>
                        </MessageComponent.Content>
                    </MessageComponent>
                </div>
            </div>
        </div >
    );
}

export default NoCookies
