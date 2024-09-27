'use client'
import { Disclosure } from '@headlessui/react';
import { Album, ChevronDown, Mail, ScrollText, User } from 'lucide-react';
import { Field, Form, Formik, FormikErrors } from 'formik';
import { FC, useCallback } from 'react'
import toast from 'react-hot-toast';
import { useAuthDataUpdate, useAuthState } from '../context/authContext';
import { useTimerState } from '../context/timerContext';
import TokenService from '../lib/TokenService';
import BridgeAuthApiClient from '../lib/userAuthApiClient';
import SubmitButton from './buttons/submitButton';
import { Widget } from './Widget/Index';

type EmailFormValues = {
    email: string;
}

type Props = {
    onSend: (email: string) => void;
    disclosureLogin?: boolean;
}

const SendEmail: FC<Props> = ({ onSend, disclosureLogin }) => {
    const { codeRequested, tempEmail, userType } = useAuthState()
    const { setCodeRequested, updateTempEmail } = useAuthDataUpdate();
    const initialValues: EmailFormValues = { email: tempEmail ?? "" };
    const { start: startTimer } = useTimerState()

    const sendEmail = useCallback(async (values: EmailFormValues) => {
        try {
            const inputEmail = values.email;

            if (inputEmail != tempEmail || !codeRequested) {

                const apiClient = new BridgeAuthApiClient();
                const res = await apiClient.getCodeAsync(inputEmail)
                if (res.error)
                    throw new Error(res.error)
                TokenService.setCodeNextTime(res?.data?.next)
                setCodeRequested(true);
                updateTempEmail(inputEmail)
                const next = new Date(res?.data?.next)
                const now = new Date()
                const miliseconds = next.getTime() - now.getTime()
                startTimer(Math.round((res?.data?.already_sent ? 60000 : miliseconds) / 1000))
            }
            onSend(inputEmail)
        }
        catch (error) {
            if (error.response?.data?.errors?.length > 0) {
                const message = error.response.data.errors.map(e => e.message).join(", ")
                toast.error(message)
            }
            else {
                toast.error(error.message)
            }
        }
    }, [tempEmail])

    function validateEmail(values: EmailFormValues) {
        let error: FormikErrors<EmailFormValues> = {};
        if (!values.email) {
            error.email = 'Required';
        } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i.test(values.email)) {
            error.email = 'Invalid email address';
        }
        return error;
    }

    return (
      <Formik
        initialValues={initialValues}
        onSubmit={sendEmail}
        validateOnMount={true}
        validate={validateEmail}
      >
      {({ isValid, isSubmitting }) => (
        <Form autoComplete='true' className='w-full h-full'>
        {disclosureLogin ? (
          <Disclosure>
          {({ open }) => (<>
            <Disclosure.Button className="w-full text-left text-base font-light">
              <div className='flex items-center justify-between'>
                <p className='text-xl text-foreground'>
                  Sign in with email
                </p>
                <div className='bg-level-1 hover:bg-level-2 p-0.5 rounded-md duration-200 transition'>
                  <ChevronDown className={`${open ? 'rotate-180 transform' : ''} h-5 text-muted`}
                  />
                </div>
              </div>
              <p className='mt-2 text-left text-muted'>
                  Securely store your exchange accounts, access your full transfer history and more.
              </p>
            </Disclosure.Button>
            <Disclosure.Panel className="text-sm font-normal mt-4">
              <div className='grid gap-4 grid-cols-5  items-center'>
                <div className="relative rounded-md shadow-sm col-span-3">
                  <Field name="email">
                  {({ field }) => (
                    <input
                        {...field}
                        id='email'
                        placeholder="john@example.com"
                        autoComplete="email"
                        type="email"
                        className="h-12 pb-1 pt-0 text-muted  focus:ring-muted focus:border-muted border-[#404040] pr-42 block
                          placeholder:text-sm placeholder:font-normal placeholder:text-muted-2 bg-level-1 w-full rounded-md"
                    />
                  )}
                  </Field>
                </div>
                <div className='col-start-4 col-span-2'>
                    <SubmitButton isDisabled={!isValid} isSubmitting={isSubmitting} >
                        Continue
                    </SubmitButton>
                </div>
              </div>
            </Disclosure.Panel>
          </>)}
          </Disclosure>
        ) : (
          <div>
              <Widget.Content center={true}>
                  <User className='w-16 h-16 text-secondary self-center mt-auto' />
                  <div>
                      <p className='mb-6 mt-2 pt-2 text-2xl font-bold  leading-6 text-center font-roboto'>
                          What&apos;s your email?
                      </p>
                  </div>
                  <div className="relative rounded-md shadow-sm">
                      <Field name="email">
                          {({ field }) => (
                              <input
                                  {...field}
                                  id='email'
                                  placeholder="john@example.com"
                                  autoComplete="email"
                                  type="email"
                                  className="h-12 pb-1 pt-0 text-muted  focus:ring-muted-1 focus:border-[#404040] border-[#404040] pr-42 block
                               placeholder:text-sm placeholder:font-normal placeholder:text-muted-2 bg-level-1 w-full rounded-md"
                              />
                          )}
                      </Field>
                  </div>
                  <div className='px-3  my-6'>
                      <p className='text-left text-sm mb-3 font-semibold'>
                          By signing in you get
                      </p>
                      <ul className='space-y-3'>
                          <li className='flex gap-3'>
                              <div>
                                  <ScrollText className='h-5 w-5 mt-0.5 ' />
                              </div>
                              <div>
                                  <p className='font-semibold'>History</p>
                                  <p className=' text-sm'>
                                      Access your entire transaction history
                                  </p>
                              </div>
                          </li>
                          <li className='flex gap-3'>
                              <div>
                                  <Mail className='h-5 w-5 mt-0.5 ' />
                              </div>
                              <div>
                                  <p className='font-semibold'>Email updates</p>
                                  <p className=' text-sm'>
                                      Get a notification upon transfer completion
                                  </p>
                              </div>
                          </li>
                          <li className='flex gap-3'>
                              <div>
                                  <Album className='h-5 w-5 mt-0.5 ' />
                              </div>
                              <div>
                                  <p className='font-semibold'>Dedicated deposit address</p>
                                  <p className='text-sm'>
                                      Get deposit addresses that stay the same and can be whitelisted in CEXes
                                  </p>
                              </div>
                          </li>
                      </ul>
                  </div>
              </Widget.Content>
              <Widget.Footer>
                  <SubmitButton isDisabled={!isValid} isSubmitting={isSubmitting} >
                      Continue
                  </SubmitButton>
              </Widget.Footer>
          </div>
        )}
        </Form>
      )}
      </Formik >
    )
}

export default SendEmail;