import { useEffect } from "react";
import { useIntercom } from "react-use-intercom";
import { useAuthState } from "../../context/authContext";
import SubmitButton from "../buttons/submitButton";
import CardContainer from "../cardContainer";
import BridgeLogo from "../icons/BridgeLogo";
import TwitterLogo from "../icons/TwitterLogo";

function MaintananceContent(props) {
    const { email, userId } = useAuthState()
    const { boot, show, update } = useIntercom()
    const updateWithProps = () => update({ email: email, userId: userId })

    useEffect(()=>{
        boot()
        updateWithProps()
    })
    
    const twitterLogo = <TwitterLogo className="text-primary-text h-6 w-6" />
    return (
        <div className="flex items-stretch flex-col">
            <BridgeLogo className="block md:hidden h-8 w-auto text-primary-text mt-5"></BridgeLogo>
            <CardContainer {...props} >
                <div className="flex flex-col justify-center space-y-12 p-10 text-primary-text md:min-h-fit min-h-[400px]">
                    <h1 className="text-xl tracking-tight text-gray-200">
                        <p className="mb-4 text-primary-text">
                            We&apos;re upgrading our systems and infrastructure to give you the best experience yet. 
                        </p>
                        <span className="block font-bold text-3xl xl:inline">We&apos;ll be back at 15:00 UTC</span>
                        <p className="mt-4 text-primary-text">
                            Any pending swaps will be completed after maintenance.
                        </p>
                    </h1>
                    <SubmitButton onClick={() => window.open('https://twitter.com/layerswap', '_blank')} icon={twitterLogo} isDisabled={false} isSubmitting={false}>Follow for updates</SubmitButton>
                </div>
            </CardContainer>
        </div>
    );
}

export default MaintananceContent;
