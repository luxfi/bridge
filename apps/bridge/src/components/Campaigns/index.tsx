'use client'

import Image from 'next/image'
import useSWR from 'swr'
import { Gift } from 'lucide-react'

import { ApiResponse } from '@/Models/ApiResponse'
import BridgeApiClient, { type Campaign } from '@/lib/BridgeApiClient'
import { type Layer } from '@/Models/Layer'
import { useSettings } from '@/context/settings'

import SpinIcon from '../icons/spinIcon'
import LinkWrapper from '../LinkWrapper'
import Widget from '../Widget'

const Rewards = () => {

    const { layers, resolveImgSrc } = useSettings()
    const apiClient = new BridgeApiClient()
    const { data: campaignsData, isLoading } = useSWR<ApiResponse<Campaign[]>>('/campaigns', apiClient.fetcher)
    const campaigns = campaignsData?.data

    const activeCampaigns = campaigns?.filter(IsCampaignActive) || []
    const inactiveCampaigns = campaigns?.filter(c => !IsCampaignActive(c)) || []

    return (
        <Widget className='min-h-[520px]'>
            <Widget.Content>
                {!isLoading ?
                    <div className='space-y-5 h-full text-muted'>
                        <div className='space-y-2'>
                            <p className='font-bold text-left leading-5'>Campaigns</p>
                            <div className='border border-[#404040] transition duration-200 rounded-lg shadow-lg'>
                                <div className='p-3 space-y-4'>
                                    {
                                        activeCampaigns.length > 0 ?
                                            activeCampaigns.map(c =>
                                                <CampaignItem
                                                    campaign={c}
                                                    layers={layers}
                                                    resolveImgSrc={resolveImgSrc}
                                                    key={c.id}
                                                />)
                                            :
                                            <div className='flex flex-col items-center justify-center space-y-2'>
                                                <Gift className='h-10 w-10 text-secondary' />
                                                <p className='font-bold text-center'>There are no active campaigns right now</p>
                                            </div>
                                    }
                                </div>
                            </div>
                        </div>
                        {
                            inactiveCampaigns.length > 0 &&
                            <div className='space-y-2'>
                                <p className='font-bold text-left leading-5'>Old campaigns</p>
                                <div className='border border-[#404040] transition duration-200 rounded-lg shadow-lg'>
                                    <div className='p-3 dpsv flex flex-col space-y-4'>
                                        {inactiveCampaigns.map(c =>
                                            <CampaignItem
                                                campaign={c}
                                                layers={layers}
                                                resolveImgSrc={resolveImgSrc}
                                                key={c.id}
                                            />)}
                                    </div >
                                </div >
                            </div >
                        }
                    </div >
                    :
                    <div className='absolute top-[calc(50%-5px)] left-[calc(50%-5px)]'>
                        <SpinIcon className='animate-spin h-5 w-5' />
                    </div>
                }
            </Widget.Content>
        </Widget>
    )
}

const CampaignItem: React.FC<{
    campaign: Campaign,
    layers: Layer[],
    resolveImgSrc: (item: Layer) => string
}> = ({ 
  campaign, 
  layers, 
  resolveImgSrc 
}) => {

    const campaignLayer = layers.find(l => l.internal_name === campaign.network)
    const campaignDaysLeft = ((new Date(campaign.end_date).getTime() - new Date().getTime()) / 86400000).toFixed()
    const campaignIsActive = IsCampaignActive(campaign)

    return <LinkWrapper href={`/campaigns/${campaign.name}`}
        className='flex justify-between items-center'>
        <span className='flex items-center gap-1 hover:text-foreground active:scale-90 duration-200 transition-all'>
            <span className='h-5 w-5 relative'>
                {campaignLayer && <Image
                    src={resolveImgSrc(campaignLayer)}
                    alt='Project Logo'
                    height='40'
                    width='40'
                    loading='eager'
                    className='rounded-md object-contain' />}
            </span>
            <span className='font-semibold text-base text-left flex items-center'>{campaign?.display_name} </span>
        </span>
        {
            campaignIsActive &&
            <span className=' text-right text-sm'>
                {campaignDaysLeft} days left
            </span>
        }
    </LinkWrapper>
}

function IsCampaignActive(campaign: Campaign) {
    const now = new Date()
    return campaign.status == 'active' && (new Date(campaign?.end_date).getTime() > now.getTime())
}

export default Rewards
