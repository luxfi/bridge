import BridgeApiClient from '../../lib/BridgeApiClient';
import Layout from '../../components/layout';
import { InferGetServerSidePropsType } from 'next';
import React from 'react';
import { SwapDataProvider } from '../../context/swap';
import BridgeAuthApiClient from '../../lib/userAuthApiClient';
import { TimerProvider } from '../../context/timerContext';
import { BridgeAppSettings } from '../../Models/BridgeAppSettings';
import { getThemeData } from '../../helpers/settingsHelper';
import SwapWithdrawal from '../../components/SwapWithdrawal'

const SwapDetails = ({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) => {

  let appSettings = new BridgeAppSettings(settings)
  BridgeAuthApiClient.identityBaseEndpoint = appSettings.discovery.identity_url

  return (<>
    <Layout settings={appSettings} themeData={themeData}>
      <SwapDataProvider >
        <TimerProvider>
          <SwapWithdrawal />
        </TimerProvider>
      </SwapDataProvider >
    </Layout>
  </>)
}

export const getServerSideProps = async (ctx) => {
  const params = ctx.params;
  let isValidGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.swapId);
  if (!isValidGuid) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      }
    }
  }

  var apiClient = new BridgeApiClient();
  const { data } = await apiClient.GetSettingsAsync()
  const settings = data
  let themeData = await getThemeData(ctx.query)
  return {
    props: {
      settings,
      themeData
    }
  }
}

export default SwapDetails