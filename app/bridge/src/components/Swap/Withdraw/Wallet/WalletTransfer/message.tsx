'use client'
import { useState } from "react";
import FailIcon from "../../../../icons/FailIcon";
import Modal from "../../../../modal/modal";
import { ChevronDown, ChevronUp } from "lucide-react";

export type WalletMessageProps = {
    header: string;
    details: string;
    status: 'pending' | 'error';
    showInModal?: boolean;
}
const WalletMessage: React.FC<WalletMessageProps> = ({ header, details, status, showInModal }) => {
    const [showErrorModal, setShowErrorModal] = useState(false);

    return <div className="flex text-center mb-2 space-x-2">
        <div className='relative'>
            {
                status === "error" ?
                    <FailIcon className="relative top-0 left-0 w-6 h-6 md:w-7 md:h-7" />
                    :
                    <>
                        <div className='absolute top-1 left-1 w-4 h-4 md:w-5 md:h-5 opacity-40 bg bg-primary rounded-full animate-ping'></div>
                        <div className='absolute top-2 left-2 w-2 h-2 md:w-3 md:h-3 opacity-40 bg bg-primary rounded-full animate-ping'></div>
                        <div className='relative top-0 left-0 w-6 h-6 md:w-7 md:h-7 scale-50 bg bg-primary rounded-full '></div>
                    </>
            }
        </div>
        {
            showInModal ?
                <div className="text-left space-y-1 w-full max-w-2xl">
                    <button onClick={() => setShowErrorModal(true)} className="flex justify-between w-full">
                        <p className="text-md font-semibold self-center ">
                            {header}
                        </p>
                       {showErrorModal? <ChevronDown className="" />: <ChevronUp className="" />}
                    </button>
                    {/* TODO handle overflow */}
                    <Modal height="fit" show={showErrorModal} setShow={setShowErrorModal}>
                        <div className="text-left space-y-1">
                            <p className="text-md font-semibold self-center ">
                                {header}
                            </p>
                            <p className="text-sm  break-all whitespace-pre-wrap">
                                {details}
                            </p>
                        </div>
                    </Modal>
                </div>
                :
                <div className="text-left space-y-1">
                    <p className="text-md font-semibold self-center ">
                        {header}
                    </p>
                    <p className="text-sm  break-all">
                        {details}
                    </p>
                </div>
        }
    </div>
}

export default WalletMessage