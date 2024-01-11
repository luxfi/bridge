import React from 'react'

import { InferGetServerSidePropsType } from 'next'

import Layout from '../../components/layout'
import CampaignDetails from '../../components/Campaigns/Details'
import { getServerSideProps } from '../../helpers/getSettings'

function RewardsPage({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {

  return (
    <Layout settings={settings} themeData={themeData}>
      <CampaignDetails />
    </Layout>
  )
}

export default RewardsPage
