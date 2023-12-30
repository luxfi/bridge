import Layout from '../components/layout'
import { FormWizardProvider } from '../context/formWizardProvider'
import { AuthStep } from '../Models/Wizard'
import AuthWizard from '../components/Wizard/AuthWizard'
import BridgeAuthApiClient from '../lib/userAuthApiClient'
import { useEffect, useState } from 'react'
import inIframe from '../components/utils/inIframe'
import { SwapDataProvider } from '../context/swap'
import { BridgeAppSettings } from '../Models/BridgeAppSettings'
import { InferGetServerSidePropsType } from 'next'
import { getServerSideProps } from '../helpers/getSettings'

export default function AuthPage({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let appSettings = new BridgeAppSettings(settings)
  BridgeAuthApiClient.identityBaseEndpoint = appSettings.discovery.identity_url
  const [embedded, setEmbedded] = useState<boolean>()

  useEffect(() => {
    setEmbedded(inIframe())
  }, [])

  return (<>
    <Layout settings={appSettings} themeData={themeData} >
      <SwapDataProvider>
        <FormWizardProvider initialStep={AuthStep.Email} initialLoading={false}>
          <AuthWizard />
        </FormWizardProvider >
      </SwapDataProvider>
    </Layout>
  </>
  )
}

export { getServerSideProps };
