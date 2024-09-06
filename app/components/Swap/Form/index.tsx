'use client'
import { Formik, FormikProps } from "formik";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsState } from "../../../context/settings";
import { SwapFormValues } from "../../DTOs/SwapFormValues";
import Copier from './Copier';
import { useSwapDataState, useSwapDataUpdate } from "../../../context/swap";
import React from "react";
import ConnectNetwork from '@/components/ConnectNetwork';
import toast from "react-hot-toast";
import MainStepValidation from "../../../lib/mainStepValidator";
import { generateSwapInitialValues, generateSwapInitialValuesFromSwap } from "../../../lib/generateSwapInitialValues";
import BridgeApiClient, { SwapStatusInNumbers } from "../../../lib/BridgeApiClient";
import Modal from "../../modal/modal";
import SwapForm from "./Form";
import { useRouter } from "next/router";
import useSWR, { mutate } from "swr";
import { ApiResponse } from "../../../Models/ApiResponse";
import { Partner } from "../../../Models/Partner";
import { UserType, useAuthDataUpdate } from "../../../context/authContext";
import { ApiError, LSAPIKnownErrorCode } from "../../../Models/ApiError";
import { resolvePersistantQueryParams } from "../../../helpers/querryHelper";
import { useQueryState } from "../../../context/query";
import TokenService from "../../../lib/TokenService";
import BridgeAuthApiClient from "../../../lib/userAuthApiClient";
import StatusIcon from "../../SwapHistory/StatusIcons";
import Image from 'next/image';
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useFee } from "../../../context/feeContext";
import ResizablePanel from "../../ResizablePanel";

type NetworkToConnect = {
    DisplayName: string;
    AppURL: string;
}
const SwapDetails = dynamic(() => import(".."), {
    loading: () => <div className="w-full h-[450px]">
        <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-6 py-1">
                <div className="h-32 bg-level-1 rounded-lg"></div>
                <div className="h-40 bg-level-1 rounded-lg"></div>
                <div className="h-12 bg-level-1 rounded-lg"></div>
            </div>
        </div>
    </div>
})

export default function Form() {
    const formikRef = useRef<FormikProps<SwapFormValues>>(null);
    const [showConnectNetworkModal, setShowConnectNetworkModal] = useState(false);
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [networkToConnect, setNetworkToConnect] = useState<NetworkToConnect>();
    const router = useRouter();
    const { updateAuthData, setUserType } = useAuthDataUpdate()

    const settings = useSettingsState();
    const query = useQueryState()
    const { createSwap, setSwapId } = useSwapDataUpdate()

    const client = new BridgeApiClient()
    const { data: partnerData } = useSWR<ApiResponse<Partner>>(query?.appName && `/apps?name=${query?.appName}`, client.fetcher)
    const partner = query?.appName && partnerData?.data?.name?.toLowerCase() === (query?.appName as string)?.toLowerCase() ? partnerData?.data : undefined

    const { swap } = useSwapDataState()
    const { minAllowedAmount, maxAllowedAmount } = useFee()

    useEffect(() => {
        if (swap) {
            const initialValues = generateSwapInitialValuesFromSwap(swap, settings)
            formikRef?.current?.resetForm({ values: initialValues })
            formikRef?.current?.validateForm(initialValues)
        }
    }, [swap])

    const handleSubmit = useCallback(async (values: SwapFormValues) => {
        try {
            const accessToken = TokenService.getAuthData()?.access_token
            console.log(accessToken)
            // if (!accessToken) {
            //     try {
            //         var apiClient = new BridgeAuthApiClient();
            //         const res = await apiClient.guestConnectAsync()
            //         updateAuthData(res)
            //         setUserType(UserType.GuestUser)
            //     }
            //     catch (error) {
            //         toast.error(error.response?.data?.error || error.message)
            //         return;
            //     }
            // }
            console.log({ values, query, partner })
            const swapId = await createSwap(values, query, partner);
            console.log({ swapId })

            if (swapId) {
                setSwapId(swapId)
                var swapURL = window.location.protocol + "//"
                    + window.location.host + `/swap/${swapId}`;
                const params = resolvePersistantQueryParams(router.query)
                if (params && Object.keys(params).length) {
                    const search = new URLSearchParams(params as any);
                    if (search)
                        swapURL += `?${search}`
                }
                window.history.pushState({ ...window.history.state, as: swapURL, url: swapURL }, '', swapURL);
                setShowSwapModal(true)
            }
            mutate(`/swaps?status=${SwapStatusInNumbers.Pending}&version=${BridgeApiClient.apiVersion}`)
        }
        catch (error) {
            const data: ApiError = error?.response?.data?.error
            if (data?.code === LSAPIKnownErrorCode.BLACKLISTED_ADDRESS) {
                toast.error("You can't transfer to that address. Please double check.")
            }
            else if (data?.code === LSAPIKnownErrorCode.INVALID_ADDRESS_ERROR) {
                toast.error(`Enter a valid ${values.to?.display_name} address`)
            }
            else if (data?.code === LSAPIKnownErrorCode.UNACTIVATED_ADDRESS_ERROR && values.to) {
                setNetworkToConnect({
                    DisplayName: values.to?.display_name,
                    AppURL: data.message
                })
                setShowConnectNetworkModal(true);
            }
            else {
                toast.error(error.message)
            }
        }
    }, [createSwap, query, partner, router, updateAuthData, setUserType, swap])

    const destAddress: string = query?.destAddress as string;

    const isPartnerAddress = partner && destAddress;

    const isPartnerWallet = isPartnerAddress && partner?.is_wallet;

    const initialValues: SwapFormValues = swap ? generateSwapInitialValuesFromSwap(swap, settings)
        : generateSwapInitialValues(settings, query)
    const initiallyValidation = MainStepValidation({ minAllowedAmount, maxAllowedAmount })(initialValues)
    const initiallyIsValid = Object.values(initiallyValidation)?.filter(v => v).length > 0


    const handleClosesSwapModal = () => {
        let homeURL = window.location.protocol + "//"
            + window.location.host

        const params = resolvePersistantQueryParams(router.query)
        if (params && Object.keys(params).length) {
            const search = new URLSearchParams(params as any);
            if (search)
                homeURL += `?${search}`
        }
        window.history.replaceState({ ...window.history.state, as: homeURL, url: homeURL }, '', homeURL);
    }

    return <>
        <Modal
            height="fit"
            show={showConnectNetworkModal}
            setShow={setShowConnectNetworkModal}
            header={`${networkToConnect?.DisplayName} connect`}
        >
            {networkToConnect && (
                <ConnectNetwork NetworkDisplayName={networkToConnect?.DisplayName} AppURL={networkToConnect?.AppURL} />
            )}
        </Modal>
        <Modal height='fit'
            show={showSwapModal}
            setShow={setShowSwapModal}
            header={`Complete the swap`}
            onClose={handleClosesSwapModal}
        >
            <ResizablePanel>
                <SwapDetails type="contained" />
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
        <Formik
            innerRef={formikRef}
            initialValues={initialValues}
            validateOnMount={true}
            validate={MainStepValidation({ minAllowedAmount, maxAllowedAmount })}
            onSubmit={handleSubmit}
            isInitialValid={!initiallyIsValid}
        >
            <SwapForm isPartnerWallet={!!isPartnerWallet} partner={partner} />
        </Formik>
    </>
}
