'use client'
import { Formik, FormikProps } from "formik";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsState } from "../../context/settings";
// import Copier from './Copier';
// import { useSwapDataState, useSwapDataUpdate } from "../../../context/swap";
import React from "react";
import Modal from "../modal/modal";
import SwapFrom from './Form/Form';
import TokenService from "../../lib/TokenService";
import StatusIcon from "../SwapHistory/StatusIcons";
import ResizablePanel from "../ResizablePanel";
import toast from "react-hot-toast";
import Image from 'next/image';
import dynamic from "next/dynamic";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useFee } from "../../context/feeContext";
import { useRouter } from "next/router";


// const SwapDetails = dynamic(() => import(".."), {
//     loading: () => <div className="w-full h-[450px]">
//         <div className="animate-pulse flex space-x-4">
//             <div className="flex-1 space-y-6 py-1">
//                 <div className="h-32 bg-level-1 rounded-lg"></div>
//                 <div className="h-40 bg-level-1 rounded-lg"></div>
//                 <div className="h-12 bg-level-1 rounded-lg"></div>
//             </div>
//         </div>
//     </div>
// })

export default function Form() {

    const [showConnectNetworkModal, setShowConnectNetworkModal] = React.useState<boolean>(false);
    const [showSwapModal, setShowSwapModal] = React.useState<boolean>(false);

    return <>
        <Modal
            height="fit"
            show={showConnectNetworkModal}
            setShow={setShowConnectNetworkModal}
            header={`Network connect`}
        >
            {/* {networkToConnect && (
                <ConnectNetwork NetworkDisplayName={networkToConnect?.DisplayName} AppURL={networkToConnect?.AppURL} />
            )} */}
            <div>asdf</div>
        </Modal>
        <Modal height='fit'
            show={showSwapModal}
            setShow={setShowSwapModal}
            header={`Complete the swap`}
            onClose={() => setShowSwapModal(false)}
        >
            <ResizablePanel>
                {/* <SwapDetails type="contained" /> */}
                <div>Hello</div>
            </ResizablePanel>
            {/* <div className="w-full py-2">
            <div className="my-5 px-2 py-3 rounded-lg border-[#9e88882c] bg-[black]/20">
                <div className="">Deposit Address</div>
                <div className="flex gap-1 items-center">
                    <div className="text-sm mt-1 truncate">0x2781BDC83A612F0FE382476556C0Cc12fE602294</div>
                    <Copier text="0x2781BDC83A612F0FE382476556C0Cc12fE602294"/>
                </div>
            </div>
        </div> */}
        </Modal>
        {/* <Formik
            innerRef={formikRef}
            initialValues={initialValues}
            validateOnMount={true}
            validate={MainStepValidation({ minAllowedAmount, maxAllowedAmount })}
            onSubmit={handleSubmit}
            isInitialValid={!initiallyIsValid}
        >
            <SwapForm isPartnerWallet={!!isPartnerWallet} partner={partner} />
        </Formik> */}
        <SwapFrom />
    </>
}
