'use client'
import { useCallback, useRef, useState, type ChangeEventHandler } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'


import { useSettings } from '@/context/settings'
import { useSwapDataState } from '@/context/swap'
import { useInterval } from '@/hooks/useInterval'
import { CalculateMinimalAuthorizeAmount } from '@/lib/fees'
import { parseJwt } from '@/lib/jwtParser'
//import BridgeApiClient from '@/lib/BridgeApiClient'
import { OpenLink } from '@/lib/openLink'
import TokenService from '@/lib/TokenService'
import SubmitButton from '../../../buttons/submitButton'
import Carousel, { CarouselItem, type CarouselRef } from '../../../Carousel'
import { FirstScreen, FourthScreen, LastScreen, SecondScreen, ThirdScreen } from './ConnectGuideScreens'
import KnownInternalNames from '@/lib/knownIds'
import { type Layer } from '@/Models/Layer'
import IconButton from '../../../buttons/iconButton'
import { useCoinbaseStore } from './CoinbaseStore'
import Widget from '../../../Widget'


const Authorize: React.FC<{
  onAuthorized: () => void,
  onDoNotConnect: () => void,
  stickyFooter: boolean,
  hideHeader?: boolean,
}> = ({ 
  onAuthorized, 
  //stickyFooter, 
  //onDoNotConnect, 
  hideHeader 
}) => {

    const { swap } = useSwapDataState()
    const { layers } = useSettings()
    
    const params = useSearchParams()
    const paramsString = params.toString()

    let alreadyFamiliar = useCoinbaseStore((state) => state.alreadyFamiliar)
    let toggleAlreadyFamiliar = useCoinbaseStore((state) => state.toggleAlreadyFamiliar)
    const [carouselFinished, setCarouselFinished] = useState(alreadyFamiliar)

    const [authWindow, setAuthWindow] = useState<Window | null>()
    const [firstScreen, setFirstScreen] = useState<boolean>(true)

    const carouselRef = useRef<CarouselRef | null>(null)
    const exchange_internal_name = swap?.source_exchange
    const asset_name = swap?.source_asset

    const exchange = layers.find(e => e.internal_name?.toLowerCase() === exchange_internal_name?.toLowerCase()) as Layer
    const currency = exchange?.assets.find(c => asset_name?.toLocaleUpperCase() === c.asset?.toLocaleUpperCase())

    const oauthProviders = {} as any //TODO config oauth_providers
    const coinbaseOauthProvider = oauthProviders?.find((p: any) => (p.provider === KnownInternalNames.Exchanges.Coinbase))
    const { oauth_authorize_url } = coinbaseOauthProvider || {}

    const minimalAuthorizeAmount = currency?.price_in_usd ?
        CalculateMinimalAuthorizeAmount(currency?.price_in_usd, Number(swap?.requested_amount)) : null

    const checkShouldStartPolling = useCallback(() => {
        let authWindowHref: string | undefined = ""
        try {
            authWindowHref = authWindow?.location?.href
        }
        catch( e: any ) {
            //throws error when accessing href TODO research safe way
        }
        if (authWindowHref && authWindowHref?.indexOf(window.location.origin) !== -1) {
            authWindow?.close()
            onAuthorized()
        }
    }, [authWindow])

    useInterval(
      checkShouldStartPolling,
      (authWindow && !authWindow.closed) ? 1000 : null,
    )

    const handleConnect = useCallback(() => {
        try {
            if (!swap)
                return
            if (!carouselFinished && !alreadyFamiliar) {
                carouselRef?.current?.next()
                return
            }
            const access_token = TokenService.getAuthData()?.access_token
            if (!access_token) {
                //TODO handle not authenticated
                return
            }
            const { sub } = parseJwt(access_token) || {}
            const encoded = btoa(JSON.stringify({ SwapId: swap?.id, UserId: sub, RedirectUrl: `${window.location.origin}/salon` }))
            const authWindow = OpenLink({ link: oauth_authorize_url + encoded, query: params, swapId: swap.id })
            setAuthWindow(authWindow)
        }
        catch( e: any ) {
            toast.error(e.message)
        }
    }, [carouselFinished, alreadyFamiliar, swap?.id, oauth_authorize_url, paramsString])

    const handlePrev = useCallback(() => {
        carouselRef?.current?.prev()
        return
    }, [])

    const exchange_name = exchange?.display_name

    const onCarouselLast = (value: boolean) => {
        setCarouselFinished(value)
    }

    const handleToggleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        if (e.target.checked) {
            carouselRef?.current?.goToLast()
        } else {
            carouselRef?.current?.goToFirst()
        }
        toggleAlreadyFamiliar()
    }

    return (
        <>
            <Widget.Content>
                {
                    !hideHeader ?
                        <h3 className='md:mb-4 pt-2 text-lg sm:text-xl text-left font-roboto  font-semibold'>
                            Please connect your {exchange_name} account
                        </h3>
                        : <></>
                }
                {
                    <div className="w-full flex flex-col self-center h-[100%]">
                        {swap && <Carousel onLast={onCarouselLast} onFirst={setFirstScreen} ref={carouselRef} starAtLast={alreadyFamiliar}>
                            <CarouselItem width={100} >
                                <FirstScreen exchange_name={exchange_name} />
                            </CarouselItem>
                            <CarouselItem width={100}>
                                <SecondScreen />
                            </CarouselItem>
                            <CarouselItem width={100}>
                                <ThirdScreen minimalAuthorizeAmount={minimalAuthorizeAmount} />
                            </CarouselItem>
                            <CarouselItem width={100}>
                                <FourthScreen minimalAuthorizeAmount={minimalAuthorizeAmount} />
                            </CarouselItem>
                            <CarouselItem width={100}>
                                <LastScreen number={!alreadyFamiliar} minimalAuthorizeAmount={Number(minimalAuthorizeAmount)} />
                            </CarouselItem>
                        </Carousel>}
                    </div>
                }
            </Widget.Content>
            <Widget.Footer sticky={true}>
                <div>
                    {
                        <div className="flex items-center mb-3">
                            <input
                                name="alreadyFamiliar"
                                id='alreadyFamiliar'
                                type="checkbox"
                                className="h-4 w-4 bg-level-1 cursor-pointer rounded border-[#404040] text-priamry"
                                onChange={handleToggleChange}
                                checked={alreadyFamiliar}
                            />
                            <label htmlFor="alreadyFamiliar" className="ml-2 cursor-pointer block text-sm ">
                                I&aposm already familiar with the process.
                            </label>
                        </div>
                    }
                    {
                        <div className='flex items-center'>
                            {(!firstScreen && !alreadyFamiliar) &&
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <IconButton onClick={handlePrev} className='mr-4 py-3 px-3' icon={<ArrowLeft strokeWidth="3" />} />
                                </motion.div>
                            }
                            <SubmitButton isDisabled={false} isSubmitting={false} onClick={handleConnect}>
                                {
                                    carouselFinished ? "Connect" : "Next"
                                }
                            </SubmitButton>
                        </div>
                    }
                    <div className="pt-2 font-normal text-xs ">
                        <p className="block font-lighter text-left">
                            <span>Even after authorization Bridge can&apost initiate a withdrawal without your explicit confirmation.&nbsp</span>
                            <a target='_blank' href='https://docs.bridge.lux.network/user-docs/connect-a-coinbase-account' className=' underline hover:no-underline decoration-white cursor-pointer'>Learn more</a></p>
                    </div>
                </div>
            </Widget.Footer>
        </ >
    )
}

export default Authorize