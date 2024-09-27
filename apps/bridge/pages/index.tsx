
import Layout from '../components/layout'
import React from 'react';
import { InferGetServerSidePropsType } from 'next'
import { getServerSideProps } from '@/helpers/getSettings'
import { useAtom } from 'jotai';
import { useTelepoterAtom } from '@/store/teleport';
import Swapper from '@/components/Swapper';

export default function Home({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [useTeleporter] = useAtom(useTelepoterAtom);
  return (
    <Layout settings={settings} themeData={themeData}>
      <Swapper />
    </Layout>
  )
}

export { getServerSideProps };