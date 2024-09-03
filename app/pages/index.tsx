
import { InferGetServerSidePropsType } from 'next'
import dynamic from 'next/dynamic';

import Layout from '../components/layout'
import Swap from '@/components/swapComponent'
// import Teleporter from '../components/Teleport/Swap/index'
import { getServerSideProps } from '@/helpers/getSettings'

const Teleporter = dynamic(() => import('@/components/Teleport/Swap/index'));

export default function Home({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <Layout settings={settings} themeData={themeData}>
      <Teleporter />
      {/* <Swap /> */}
    </Layout>
  )
}

export { getServerSideProps };
