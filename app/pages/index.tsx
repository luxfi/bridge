
import { InferGetServerSidePropsType } from 'next'
import dynamic from 'next/dynamic';

import Layout from '../components/layout'
import Swap from '@/components/swapComponent'
import Teleporter from '../components/teleport/swap/Teleporter'
import { getServerSideProps } from '@/helpers/getSettings'

export default function Home({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <Layout settings={settings} themeData={themeData}>
      <Teleporter />
      {/* <Swap /> */}
    </Layout>
  )
}

export { getServerSideProps };
