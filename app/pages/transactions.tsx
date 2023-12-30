import Layout from '../components/layout'
import { InferGetServerSidePropsType } from 'next'
import BridgeAuthApiClient from '../lib/userAuthApiClient'
import { SwapDataProvider } from '../context/swap'
import TransfersWrapper from '../components/SwapHistory/TransfersWrapper'
import { BridgeAppSettings } from '../Models/BridgeAppSettings'
import { getServerSideProps } from '../helpers/getSettings'

export default function Transactions({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let appSettings = new BridgeAppSettings(settings)
  BridgeAuthApiClient.identityBaseEndpoint = appSettings.discovery.identity_url


  return (
    <>
      <Layout settings={appSettings} themeData={themeData}>
        <SwapDataProvider >
          <TransfersWrapper />
        </SwapDataProvider >
      </Layout>
    </>
  )
}

export { getServerSideProps };
