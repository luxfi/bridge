import { InferGetServerSidePropsType } from 'next'

import Layout from '../components/layout'
import Swap from '../components/swapComponent'
import { getServerSideProps } from '../helpers/getSettings'

export default function Home({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <Layout settings={settings} themeData={themeData}>
      <Swap />
    </Layout>
  )
}

export { getServerSideProps };
