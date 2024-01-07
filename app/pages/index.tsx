import Layout from '../components/layout'
import BridgeApiClient from '../lib/BridgeApiClient'
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import { BridgeSettings } from '../Models/BridgeSettings'
import { validateSignature } from '../helpers/validateSignature'
import { mapNetworkCurrencies } from '../helpers/settingsHelper'
import { THEME_COLORS, ThemeData } from '../Models/Theme'
import Swap from '../components/swapComponent'
type IndexProps = {
  settings?: BridgeSettings,
  themeData?: ThemeData,
  inMaintanance: boolean,
  validSignatureisPresent?: boolean,
}

export default function Home({ settings, inMaintanance, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (<>
    <Layout settings={settings} themeData={themeData}>
      <Swap />
    </Layout>
  </>)
}

export async function getServerSideProps(context: GetServerSidePropsContext) {

  const validSignatureIsPresent = validateSignature(context.query)

  let result: IndexProps = {
    inMaintanance: false,
  };

  context.res.setHeader(
    'Cache-Control',
    's-maxage=60, stale-while-revalidate'
  );

  const themeName = (context.query.theme) ? context.query.theme as string: (context.query.addressSource  ? context.query.addressSource as string : '')

  result.themeData = await getThemeData(themeName)

  var apiClient = new BridgeApiClient();
  const { data: settings } = await apiClient.GetSettingsAsync()
  if (!settings)
    return {
      props: result,
    }

  settings.exchanges = mapNetworkCurrencies(settings.exchanges, settings.networks)

  result.settings = settings;
  result.settings.validSignatureisPresent = validSignatureIsPresent;
  if (!result.settings.networks.some(x => x.status === "active") || process.env.IN_MAINTANANCE == 'true') {
    result.inMaintanance = true;
  }
  return {
    props: result,
  }
}

const getThemeData = async (theme_name: string) => {
  try {
    // const internalApiClient = new InternalApiClient()
    // const themeData = await internalApiClient.GetThemeData(theme_name);
    // result.themeData = themeData as ThemeData;
    return THEME_COLORS[theme_name] || null;
  }
  catch (e) {
    console.log(e)
  }
} 
