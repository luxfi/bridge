import Layout from '../components/layout'
import React from 'react'
import { useRouter } from 'next/router';
import BridgeAuthApiClient from '../lib/userAuthApiClient';
import { InferGetServerSidePropsType } from 'next';
import { BridgeAppSettings } from '../Models/BridgeAppSettings';
import { getServerSideProps } from '../helpers/getSettings';
import NoCookies from '../components/NoCookies';

export default function Salon({ settings }: InferGetServerSidePropsType<typeof getServerSideProps>) {
    return (
        <div className={`flex flex-col items-center min-h-screen overflow-hidden relative font-robo`}>
            <div className="w-full max-w-lg z-[1]">
                <div className="flex content-center items-center justify-center space-y-5 flex-col container mx-auto sm:px-6 max-w-lg">
                    <div className="flex flex-col w-full ">
                        <NoCookies />
                    </div>
                </div>
            </div>
        </div>
    )
}

export { getServerSideProps };