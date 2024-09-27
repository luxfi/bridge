'use client'
import { ReactNode, useState } from "react";
import SecondaryButton from "./buttons/secondaryButton";
import { DocIframe } from "./docInIframe";
import Modal from "./modal/modal";

export default function GuideLink({ userGuideUrl, text, button, buttonClassNames }: { userGuideUrl: string, text?: string, button?: ReactNode, buttonClassNames?: string }) {
    const [showGuide, setShowGuide] = useState(false);

    return (
        <>
            {
                button ?
                    <SecondaryButton onClick={() => setShowGuide(true)} className={buttonClassNames}>
                        {button}
                    </SecondaryButton>
                    :
                    <span className='text-muted cursor-pointer hover:text-muted-2' onClick={() => setShowGuide(true)}>&nbsp;<span>{text}</span></span>
            }
            <Modal
                className="bg-background"
                height="full"
                header={text || button}
                show={showGuide}
                setShow={setShowGuide}>
                <DocIframe onConfirm={() => setShowGuide(false)} URl={userGuideUrl} />
            </Modal>
        </>
    )
}