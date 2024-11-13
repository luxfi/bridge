'use client'

import Image from 'next/image'
import { Gift } from 'lucide-react'

import { useAccount } from 'wagmi'
import useSWR from 'swr'

import { LinkElement } from '@hanzo/ui/primitives'

import { useSettings } from '@/context/settings'
import BridgeApiClient, { type Campaign } from '@/lib/BridgeApiClient'
import { type ApiResponse } from '@/Models/ApiResponse'
import { type Layer } from '@/Models/Layer'

import RainbowKit from '../../Swap/Withdraw/Wallet/RainbowKit'
import SubmitButton from '../../buttons/submitButton';
import WalletIcon from '../../icons/WalletIcon';
import LinkWrapper from '../../LinkWrapper';
import Widget from '../../Widget';
import Leaderboard from './Leaderboard'
import Rewards from './Rewards';
import SpinIcon from '../../icons/spinIcon'

const CampaignDetails: React.FC<{
  campaign: string
}> = ({
  campaign: campaignName
}) => {

    const settings = useSettings()
    const { resolveImgSrc, layers } = settings

    const { isConnected } = useAccount();

      // :aa Shouldn't this be loaded server-side in the parent page??
    const apiClient = new BridgeApiClient()
    const { data: campaignsData, isLoading } = useSWR<ApiResponse<Campaign[]>>('/campaigns', apiClient.fetcher)
    const campaign = campaignsData?.data?.find((c) => (c.name === campaignName))

    const network = layers.find(n => n.internal_name === campaign?.network)

    if (isLoading) {
        return <Loading />
    }

    if (!campaign) {
        return <NotFound />
    }

    return (
      <Widget>
        <Widget.Content>
          <div className='space-y-5'>
            <div className='flex items-center gap-1'>
            {network && (
              <div className='h-7 w-7 relative'>
                <Image
                  src={resolveImgSrc(network)}
                  alt='Project Logo'
                  height='40'
                  width='40'
                  loading='eager'
                  className='rounded-md object-contain'
                />
              </div>
            )}
              <h2 className='font-bold text-xl text-left flex items-center'>
                {network?.display_name && (<span>network.display_name&nbsp;</span>)}
                Rewards
              </h2>
            </div>
            {isConnected ? (
              <Rewards campaign={campaign} />
            ) : (
              <BriefInformation network={network} campaign={campaign} />
            )}
            <Leaderboard campaign={campaign} />
          </div>
      </Widget.Content>
      {!isConnected ? (
        <Widget.Footer>
          <RainbowKit>
            <SubmitButton isDisabled={false} isSubmitting={false} icon={<WalletIcon className='stroke-2 w-6 h-6' />}>
              Connect a wallet
            </SubmitButton>
          </RainbowKit>
        </Widget.Footer>
      ) : (<></>)}
      </Widget >
    )
}

const BriefInformation: React.FC<{
  campaign: Campaign,
  network?: Layer
}> = ({
  campaign,
  network
}) => (
    <p className="text-muted text-base">
    You can earn $<span>{campaign?.asset}</span>&nbsp;tokens by transferring
    assets to&nbsp;
    <span>{network?.display_name || campaign.network}</span>. For each
    transaction, you'll receive&nbsp;
    <span>{campaign?.percentage}</span>% of Bridge fee back.&nbsp;
    <LinkElement
      def={{
        title: "Learn more",
        newTab: true,
        href: "https://docs.lux.network",
      }}
      className="inline-flex text-primary underline hover:no-underline"
    />
  </p>
)

const Loading = () => (
  <Widget className='min-h-[500px]'>
    <Widget.Content>
        <div className='absolute top-[calc(50%-5px)] left-[calc(50%-5px)]'>
            <SpinIcon className='animate-spin h-5 w-5' />
        </div>
    </Widget.Content>
  </Widget>
)

const NotFound = () => (
  <Widget className='min-h-[500px]'>
    <Widget.Content>
        <div className='h-[364px] flex flex-col items-center justify-center space-y-4'>
            <Gift className='h-20 w-20 ' />
            <p className='font-bold text-center'>Campaign not found</p>
            <LinkWrapper className='text-xs underline hover:no-underline' href='/campaigns'>See all campaigns</LinkWrapper>
        </div>
    </Widget.Content>
  </Widget>
)

export default CampaignDetails
