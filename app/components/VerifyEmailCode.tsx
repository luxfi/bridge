import { ChevronDown, MailOpen } from 'lucide-react';
import { Form, Formik, FormikErrors } from 'formik';
import { FC, useCallback, useState } from 'react'
import toast from 'react-hot-toast';
import { useAuthDataUpdate, useAuthState, UserType } from '../context/authContext';
import { useTimerState } from '../context/timerContext';
import BridgeApiClient from '../lib/BridgeApiClient';
import BridgeAuthApiClient from '../lib/userAuthApiClient';
import { AuthConnectResponse } from '../Models/BridgeAuth';
import SubmitButton from './buttons/submitButton';
import { DocIframe } from './docInIframe';
import NumericInput from './Input/NumericInput';
import Modal from './modal/modal';
import TimerWithContext from './TimerComponent';
import { classNames } from './utils/classNames';
import { Widget } from './Widget/Index';
import toastError from '../helpers/toastError';
interface VerifyEmailCodeProps {
    onSuccessfullVerify: (authresponse: AuthConnectResponse) => Promise<void>;
    disclosureLogin?: boolean
}

interface CodeFormValues {
    Code: string
}

const VerifyEmailCode: FC<VerifyEmailCodeProps> = ({ onSuccessfullVerify, disclosureLogin }) => {
    const initialValues: CodeFormValues = { Code: '' }
    const { start: startTimer, started } = useTimerState()
    const { tempEmail, userLockedOut, guestAuthData, userType } = useAuthState();
    const { updateAuthData, setUserLockedOut } = useAuthDataUpdate()
    const [modalUrl, setModalUrl] = useState<string | null>(null);
    const [showDocModal, setShowDocModal] = useState(false)

    const handleResendCode = useCallback(async () => {
        try {
            const apiClient = new BridgeAuthApiClient();
            const res = await apiClient.getCodeAsync(tempEmail as string)
            const next = new Date(res?.data?.next)
            const now = new Date()
            const miliseconds = next.getTime() - now.getTime()
            startTimer(Math.round((res?.data?.already_sent ? 60000 : miliseconds) / 1000))
        }
        catch (error) {
            if ((error as any).response?.data?.errors?.length > 0) {
                const message = (error as any).response.data.errors.map((e: Error) => (e.message)).join(", ")
                toast.error(message)
            }
            else {
                toastError(error)
            }
        }
    }, [tempEmail])

    const openDoc = (url: string) => {
        setModalUrl(url)
        setShowDocModal(true)
    }

    const handleOpenTerms = () => openDoc('https://docs.bridge.lux.network/user-docs/information/terms-of-services')
    const handleOpenPrivacyPolicy = () => openDoc('https://docs.bridge.lux.network/user-docs/information/privacy-policy')

    const timerCountdown = userLockedOut ? 600 : 60

    return (<>
        <Modal height='full' show={showDocModal} setShow={setShowDocModal} >
            {modalUrl ? <DocIframe onConfirm={() => close()} URl={modalUrl} /> : <></>}
        </Modal>
        <Formik
            initialValues={initialValues}
            validateOnMount={true}
            validate={(values: CodeFormValues) => {
                const errors: FormikErrors<CodeFormValues> = {};
                if (!/^[0-9]*$/.test(values.Code)) {
                    errors.Code = "Value should be numeric";
                }
                else if (values.Code.length != 6) {
                    errors.Code = `The length should be 6 instead of ${values.Code.length}`;
                }
                return errors;
            }}
            onSubmit={async (values: CodeFormValues) => {
                try {
                    if (!tempEmail) {
                        //TODO show validation error
                        return
                    }
                    var apiAuthClient = new BridgeAuthApiClient();
                    var apiClient = new BridgeApiClient()
                    const res = await apiAuthClient.connectAsync(tempEmail, values.Code)
                    updateAuthData(res)
                    await onSuccessfullVerify(res);
                    if (userType == UserType.GuestUser && guestAuthData?.access_token) await apiClient.SwapsMigration(guestAuthData?.access_token)
                }
                catch (error) {
                    const message = (error as any).response?.data?.error_description
                    if ((error as any).response?.data?.error === 'USER_LOCKED_OUT_ERROR') {
                        toast.error(message)
                        setUserLockedOut(true)
                        startTimer(600)
                    }
                    else if (message) {
                        toast.error(message)
                    }
                    else {
                        toastError(error)
                    }
                }
            }}
        >
            {({ isValid, isSubmitting, errors, handleChange }) => (
                <Form className='h-full w-full text-foreground text-foreground-new'>
                    {
                        disclosureLogin ?
                            <div className='mt-2'>
                                <div className="w-full text-left text-base font-light">
                                    <div className='flex items-center justify-start'>
                                        <p className='text-xl text-muted text-muted-primary-text'>
                                            Sign in with email
                                        </p>
                                    </div>
                                    <p className='mt-2 text-left'>
                                        <span>Please enter the 6 digit code sent to </span><span className='font-medium text-muted text-muted-primary-text'>{tempEmail}</span>
                                    </p>
                                </div>
                                <div className="text-sm text-foreground text-foreground-new font-normal mt-5">
                                    <div className='grid gap-4 grid-cols-5  items-center'>
                                        <div className="relative rounded-md shadow-sm col-span-3">
                                            <NumericInput
                                                pattern='^[0-9]*$'
                                                placeholder="XXXXXX"
                                                maxLength={6}
                                                name='Code'
                                                onChange={e => {
                                                    /^[0-9]*$/.test(e.target.value) && handleChange(e)
                                                }}
                                                className="leading-none h-12 text-2xl pl-5 text-muted text-muted-primary-text  focus:ring-primary text-center focus:border-primary border-secondary-500 block
                                    placeholder:text-2xl placeholder:text-center tracking-widest placeholder:font-normal placeholder:opacity-50 bg-level-3 darker-2-class  w-full font-semibold rounded-md placeholder-primary-text"
                                            />
                                        </div>
                                        <div className='col-start-4 col-span-2'>
                                            <TimerWithContext isStarted={started} seconds={timerCountdown} waitingComponent={() => (
                                                <SubmitButton type="submit" isDisabled={(!isValid || !!userLockedOut)} isSubmitting={isSubmitting}>
                                                    {userLockedOut ? 'User is locked out' : 'Confirm'}
                                                </SubmitButton>
                                            )}>
                                                <SubmitButton type="submit" isDisabled={!isValid} isSubmitting={isSubmitting}>
                                                    Confirm
                                                </SubmitButton>
                                            </TimerWithContext>
                                        </div>
                                    </div>
                                    <span className="flex text-sm leading-6 items-center mt-0.5">
                                        <TimerWithContext isStarted={started} seconds={timerCountdown} waitingComponent={(remainingTime) => (
                                            <span className={classNames(userLockedOut && 'text-xl leading-6')}>
                                                <span>Resend in</span>
                                                <span className='ml-1'>
                                                    {remainingTime}
                                                </span>
                                            </span>
                                        )}>
                                            <span onClick={handleResendCode} className="decoration underline-offset-1 underline hover:no-underline decoration-primary-text hover:cursor-pointer">
                                                Resend code
                                            </span>
                                        </TimerWithContext>
                                    </span>
                                </div>
                            </div>
                            :
                            <Widget>
                                <Widget.Content center={true}>
                                    <MailOpen className='w-16 h-16 mt-auto text-primary self-center' />
                                    <div className='text-center mt-5'>
                                        <p className='text-lg'><span>Please enter the 6 digit code sent to&nbsp;</span><span className='font-medium text-muted text-muted-primary-text'>{tempEmail}</span></p>
                                    </div>
                                    <div className="relative rounded-md shadow-sm mt-5">
                                        <NumericInput
                                            pattern='^[0-9]*$'
                                            placeholder="XXXXXX"
                                            maxLength={6}
                                            name='Code'
                                            onChange={e => {
                                                /^[0-9]*$/.test(e.target.value) && handleChange(e)
                                            }}
                                            className="leading-none h-12 text-2xl pl-5 text-muted text-muted-primary-text  focus:ring-primary text-center focus:border-primary border-secondary-500 block
                                    placeholder:text-2xl placeholder:text-center tracking-widest placeholder:font-normal placeholder:opacity-50 bg-level-3 darker-2-class  w-full font-semibold rounded-md placeholder-primary-text"
                                        />
                                        <span className="flex text-sm leading-6 items-center mt-1.5">
                                            <TimerWithContext isStarted={started} seconds={timerCountdown} waitingComponent={(remainingTime) => (
                                                <span className={classNames(userLockedOut && 'text-xl leading-6')}>
                                                    <span>Resend in</span>
                                                    <span className='ml-1'>
                                                        {remainingTime}
                                                    </span>
                                                </span>
                                            )}>
                                                <span onClick={handleResendCode} className="decoration underline-offset-1 underline hover:no-underline decoration-primary hover:cursor-pointer">
                                                    Resend code
                                                </span>
                                            </TimerWithContext>
                                        </span>
                                    </div>
                                </Widget.Content>
                                <Widget.Footer>
                                    <p className='text-foreground text-foreground-new text-xs sm:text-sm mb-3 md:mb-5'>
                                        <span>By clicking Confirm you agree to Bridge&apos;s&nbsp;</span><span
                                            onClick={handleOpenTerms}
                                            className='decoration decoration-primary underline-offset-1 underline hover:no-underline cursor-pointer'> Terms of Service
                                        </span><span>&nbsp;and&nbsp;</span>
                                        <span
                                            onClick={handleOpenPrivacyPolicy}
                                            className='decoration decoration-primary underline-offset-1 underline hover:no-underline cursor-pointer'>Privacy Policy
                                        </span>
                                    </p>
                                    <TimerWithContext isStarted={started} seconds={timerCountdown} waitingComponent={() => (
                                        <SubmitButton type="submit" isDisabled={(!isValid || !!userLockedOut)} isSubmitting={isSubmitting}>
                                            {userLockedOut ? 'User is locked out' : 'Confirm'}
                                        </SubmitButton>
                                    )}>
                                        <SubmitButton type="submit" isDisabled={!isValid} isSubmitting={isSubmitting}>
                                            Confirm
                                        </SubmitButton>
                                    </TimerWithContext>
                                </Widget.Footer>
                            </Widget>
                    }
                </Form >
            )}
        </Formik>
    </>

    );
}

export default VerifyEmailCode;