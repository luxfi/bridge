'use client'
import { useCallback, useRef, useState } from 'react'
import { Info, ScanFace } from 'lucide-react'
import { Form, Formik, type FormikErrors, type FormikProps } from 'formik'
import toast from 'react-hot-toast'

import { useSwapDataState } from '@/context/swap'
import { useTimerState } from '@/context/timerContext'
import BridgeApiClient from '@/lib/BridgeApiClient'
import { type ApiError, LSAPIKnownErrorCode } from '@/Models/ApiError'
import SubmitButton from '../../../buttons/submitButton'
import SpinIcon from '../../../icons/spinIcon'
import NumericInput from '../../../Input/NumericInput'
import MessageComponent from '../../../MessageComponent'
import Modal from '../../../modal/modal'
import TimerWithContext from '../../../TimerComponent'
import Widget from '../../../Widget'

const TIMER_SECONDS = 120

interface CodeFormValues {
    Code: string
}

type Props = {
    onSuccess: (swapId: string) => Promise<void>
    footerStickiness?: boolean
}

//TODO email code is almost identical create reusable component for email and two factor code verification
const Coinbase2FA: React.FC<Props> = ({ onSuccess, footerStickiness = true }) => {
    const initialValues: CodeFormValues = { Code: '' }
    const { swap } = useSwapDataState()
    const [loading, setLoading] = useState(false)
    const [showInsufficientFundsModal, setShowInsufficientFundsModal] = useState(false)
    const [showFundsOnHoldModal, setShowFundsOnHoldModal] = useState(false)

    const { start: startTimer } = useTimerState()

    const formikRef = useRef<FormikProps<CodeFormValues>>(null)

    const handleSubmit = useCallback(async (values: CodeFormValues) => {
        if (!swap || !swap.source_exchange)
            return
        setLoading(true)
        try {
            const client = new BridgeApiClient()
            await client.WithdrawFromExchange(swap.id, swap.source_exchange, values.Code)
            await onSuccess(swap.id)
        }
        catch ( error: any ) {
            const data: ApiError = error?.response?.data?.error

            if (!data) {
                toast.error(error.message)
                return
            }
            else if (data.code === LSAPIKnownErrorCode.INSUFFICIENT_FUNDS) {
                setShowInsufficientFundsModal(true)
            }
            else if (data.code === LSAPIKnownErrorCode.FUNDS_ON_HOLD) {
                setShowFundsOnHoldModal(true)
            }
            else {
                toast.error(data.message)
            }
        }
        setLoading(false)
    }, [swap])

    const handleResendTwoFACode = useCallback(async () => {
        if (!swap || !swap.source_exchange)
            return
        setLoading(true)
        try {
            formikRef.current?.setFieldValue("Code", "")
            const client = new BridgeApiClient()
            await client.WithdrawFromExchange(swap.id, swap.source_exchange)
        } catch ( error: any ) {
            const data: ApiError = error?.response?.data?.error

            if (!data) {
                toast.error(error.message)
                return
            }
            if (data.code === LSAPIKnownErrorCode.COINBASE_INVALID_2FA) {
                startTimer(TIMER_SECONDS)
                return
            }
            else {
                toast.error(data.message)
            }
        }
        finally {
            setLoading(false)
        }
    }, [swap])
    return <>
        <Modal show={showInsufficientFundsModal} setShow={setShowInsufficientFundsModal} >
            <MessageComponent>
                <MessageComponent.Content center icon='red'>
                    <MessageComponent.Header>
                        Transfer failed
                    </MessageComponent.Header>
                    <MessageComponent.Description>
                        This transfer can&apost be processed because you don&apost have enough available funds on Coinbase.
                    </MessageComponent.Description>
                </MessageComponent.Content>
                <MessageComponent.Buttons>
                    <SubmitButton isDisabled={false} isSubmitting={false} onClick={() => {
                        window.open("https://www.coinbase.com/", "_blank")
                    }}>
                        Check Coinbase
                    </SubmitButton>
                </MessageComponent.Buttons>
            </MessageComponent>
        </Modal>
        <Modal show={showFundsOnHoldModal} setShow={setShowFundsOnHoldModal} >
            <MessageComponent>
                <MessageComponent.Content center icon='red'>
                    <MessageComponent.Header>
                        Transfer failed
                    </MessageComponent.Header>
                    <MessageComponent.Description>
                        This transfer can&apost be processed because your funds might be on hold on Coinbase. This usually happens when you want to cash out immediately after completeing a purchare or adding cash.
                    </MessageComponent.Description>
                </MessageComponent.Content>
                <MessageComponent.Buttons>
                    <SubmitButton isDisabled={false} isSubmitting={false} onClick={() => {
                        window.open("https://help.coinbase.com/en/coinbase/trading-and-funding/sending-or-receiving-cryptocurrency/available-balance-faq", "_blank")
                    }}>
                        Learn More
                    </SubmitButton>
                </MessageComponent.Buttons>
            </MessageComponent>
        </Modal>
        <Formik
            initialValues={initialValues}
            validateOnMount={true}
            innerRef={formikRef}
            validate={(values: CodeFormValues) => {
                const errors: FormikErrors<CodeFormValues> = {}
                if (!/^[0-9]*$/.test(values.Code)) {
                    errors.Code = "Value should be numeric"
                }
                else if (values.Code.length != 7 && values.Code.length != 6) {
                    errors.Code = `The length should be 6 or 7 instead of ${values.Code.length}`
                }
                return errors
            }}
            onSubmit={handleSubmit}
        >
            {({ isValid, isSubmitting, errors, handleChange }) => (
                <Form className='flex flex-col jutsify-center  h-full '>
                    <Widget.Content center>
                        <div className="w-full flex-col justify-between flex h-full">
                            <ScanFace className='w-12 h-12 md:w-16 md:h-16 mt-auto text-primary self-center' />
                            <div className='text-center md:mt-5 md:mb-8'>
                                <p className='mb-2 md:mb-6 mt-2 pt-2 text-2xl font-bold  leading-6 text-center font-roboto'>
                                    Coinbase 2FA
                                </p>
                                <p className='text-center text-base px-2'>
                                    Please enter the 2 step verification code of your Coinbase account.
                                </p>
                            </div>
                            <div className="relative rounded-md shadow-sm mt-2 md:mt-5">
                                <NumericInput
                                    pattern='^[0-9]*$'
                                    placeholder="XXXXXXX"
                                    maxLength={7}
                                    name='Code'
                                    onChange={e => {
                                        /^[0-9]*$/.test(e.target.value) && handleChange(e)
                                    }}
                                    className="leading-none h-12 text-2xl pl-5   focus:ring-muted text-center focus:border-muted border-[#404040] block
                                placeholder:text-2xl placeholder:text-center tracking-widest placeholder:font-normal placeholder:opacity-50 bg-level-1  w-full font-semibold rounded-md placeholder-muted-2"
                                />
                            </div>
                            <span className="flex text-sm leading-6 items-center mt-1.5">
                                <TimerWithContext seconds={120}
                                    waitingComponent={(remainingTime) => (
                                        <span>
                                            <span>Resend in</span>
                                            <span className='ml-1'>
                                                {remainingTime}
                                            </span>
                                        </span>
                                    )}>
                                    {!loading ? <span onClick={handleResendTwoFACode} className="decoration underline-offset-1 underline hover:no-underline hover:cursor-pointer">
                                        Resend code
                                    </span>
                                        : <SpinIcon className="animate-spin h-5 w-5" />}
                                </TimerWithContext>
                            </span>
                            <div className='p-4 bg-level-1  rounded-lg border border-[#404040] my-4'>
                                <div className="flex items-center">
                                    <Info className='h-5 w-5 text-secondary mr-3' />
                                    <label className="block text-sm md:text-base font-medium leading-6">To obtain the 2 step verification code, check:</label>
                                </div>
                                <ul className="list-disc font-light space-y-1 text-xs md:text-sm mt-2 ml-8 text-left">
                                    <li>your authenticator app (Google, Microsoft, or other), or</li>
                                    <li>text messages of the phone number associated with your Coinbase account</li>
                                </ul>
                            </div>
                        </div>
                    </Widget.Content>
                    <Widget.Footer sticky={footerStickiness}>
                        <div className='md:mb-5'>
                            <SubmitButton type="submit" isDisabled={!isValid || loading} isSubmitting={isSubmitting || loading}>
                                Confirm
                            </SubmitButton>
                        </div>
                    </Widget.Footer>
                </Form >
            )}
        </Formik>
    </>
}

export default Coinbase2FA