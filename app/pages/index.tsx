
import Layout from '../components/layout'
import React from 'react';
import Swap from '@/components/swapComponent'
import Teleporter from '@/components/teleport/swap/Teleporter'
import { InferGetServerSidePropsType } from 'next'
import { getServerSideProps } from '@/helpers/getSettings'
import { classNames } from '@/components/utils/classNames';
import ToggleButton from '@/components/buttons/toggleButton';

export default function Home({ settings, themeData }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [checked, setChecked] = React.useState<boolean>(false);
  return (
    <Layout settings={settings} themeData={themeData}>
      <div className='flex items-center gap-2 pb-3'>
        <ToggleButton
          value={checked}
          onChange={(value: boolean) => setChecked(value)}
          name="Teleport"
        />
        Teleport
      </div>
      {
        checked ? <Teleporter /> : <Swap />
      }
    </Layout>
  )
}

export { getServerSideProps };
