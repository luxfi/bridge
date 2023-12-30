import Layout from '../../components/layout'
import { InferGetServerSidePropsType } from 'next'
import BridgeAuthApiClient from '../../lib/userAuthApiClient'
import Campaigns from '../../components/Campaigns'
import { getServerSideProps } from '../../helpers/getSettings'
import { BridgeAppSettings } from '../../Models/BridgeAppSettings'

export default function CampaignsPage({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
    let appSettings = new BridgeAppSettings(settings)
    BridgeAuthApiClient.identityBaseEndpoint = appSettings.discovery.identity_url

    return (<>
        <Layout settings={appSettings} themeData={themeData}>
            <Campaigns />
        </Layout>
    </>)
}

export { getServerSideProps };
