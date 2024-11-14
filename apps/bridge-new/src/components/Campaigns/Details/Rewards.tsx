
'use client'
import Image from 'next/image'
import useSWR from "swr"
import { Clock } from "lucide-react"
import { useAccount } from "wagmi"

import { Progress } from "@hanzo/ui/primitives";


import { useSettings } from "@/context/settings"
import BackgroundField from "../../backgroundField";
import type { Campaign, Reward, RewardPayout } from "@/lib/BridgeApiClient"
import BridgeApiClient from "@/lib/BridgeApiClient"
import { RewardsComponentSkeleton } from "../../Skeletons"
import { ApiResponse } from "@/Models/ApiResponse"
import ClickTooltip from "../../Tooltips/ClickTooltip"
import shortenAddress from "../../utils/ShortenAddress"

const Rewards: React.FC<{
  campaign: Campaign
}> = ({
  campaign
}) => {

    const settings = useSettings()
    const { resolveImgSrc, layers } = settings
    const { address } = useAccount();
    const apiClient = new BridgeApiClient()

    const { data: rewardsData, isLoading: rewardsIsLoading } = useSWR<ApiResponse<Reward>>(`/campaigns/${campaign.id}/rewards/${address}`, apiClient.fetcher, { dedupingInterval: 60000 })
    const { data: payoutsData, isLoading: payoutsIsLoading } = useSWR<ApiResponse<RewardPayout[]>>(`/campaigns/${campaign.id}/payouts/${address}`, apiClient.fetcher, { dedupingInterval: 60000 })

    if (rewardsIsLoading || payoutsIsLoading) {
        return <RewardsComponentSkeleton />
    }

    const payouts = payoutsData?.data || []
    const totalBudget = campaign.total_budget

    const network = layers.find(n => n.internal_name === campaign.network)
    const rewards = rewardsData?.data
    const campaignEndDate = new Date(campaign.end_date)
    const now = new Date()
    const next = rewards?.next_airdrop_date ? new Date(rewards?.next_airdrop_date) : null

    const difference_in_days = next ?
        Math.floor(Math.abs(((next.getTime() - now.getTime())) / (1000 * 3600 * 24))) : null

    const difference_in_hours = (next && difference_in_days) ?
        Math.round(Math.abs(((next.getTime() - now.getTime())) / (1000 * 3600) - (difference_in_days * 24)))
        : null

    const campaignIsEnded = (campaignEndDate.getTime() - now.getTime()) < 0 || campaign.status !== 'active'

    const DistributedAmount = ((campaign.distributed_amount / campaign.total_budget) * 100)
    const usdc_price = network?.assets?.find(c => c.asset === campaign.asset)?.price_in_usd
    const total_amount = rewards?.user_reward.total_amount
    const total_in_usd = (total_amount && usdc_price) ? (usdc_price * total_amount).toFixed(2) : null

    return <>
        <div className="space-y-4">
            <p className="">
                <span>
                    <span>Onboarding incentives that are earned by transferring to&nbsp;</span>{network?.display_name}<span>.&nbsp;</span>
                    <a
                        target='_blank'
                        href="https://docs.lux.network/"
                        className=" underline hover:no-underline decoration-white cursor-pointer"
                    >Learn more</a>
                </span>
            </p>
            <div className="bg-background divide-y divide-muted-3 rounded-lg shadow-lg border border-[#404040] hover:border-[#404040] transition duration-200">
                {!campaignIsEnded &&
                    <BackgroundField header={<span className="flex justify-between"><span className="flex items-center"><span>Pending Earnings&nbsp;</span><ClickTooltip text={`${campaign?.asset} tokens that will be airdropped periodically.`} /> </span><span>Next Airdrop</span></span>} withoutBorder>
                        <div className="flex justify-between w-full text-2xl">
                            <div className="flex items-center space-x-1">
                                <div className="h-5 w-5 relative">
                                    <Image
                                        src={resolveImgSrc(campaign)}
                                        alt="Project Logo"
                                        height="40"
                                        width="40"
                                        loading="eager"
                                        className="rounded-full object-contain" />
                                </div>
                                <p>
                                    {rewards?.user_reward.total_pending_amount} <span className="text-base sm:text-2xl">{campaign?.asset}</span>
                                </p>
                            </div>
                            <div className="flex items-center space-x-1">
                                <Clock className="h-5" />
                                <p>
                                    {difference_in_days}d {difference_in_hours}h
                                </p>
                            </div>
                        </div>
                    </BackgroundField>
                }
                <BackgroundField header={<span className="flex justify-between"><span className="flex items-center"><span>Total Earnings&nbsp;</span><ClickTooltip text={`${campaign?.asset} tokens that you’ve earned so far (including Pending Earnings).`} /></span><span>Current Value</span></span>} withoutBorder>
                    <div className="flex justify-between w-full text-slate-300 text-2xl">
                        <div className="flex items-center space-x-1">
                            <div className="h-5 w-5 relative">
                                <Image
                                    src={resolveImgSrc(campaign)}
                                    alt="Project Logo"
                                    height="40"
                                    width="40"
                                    loading="eager"
                                    className="rounded-full object-contain" />
                            </div>
                            <p>
                                {rewards?.user_reward.total_amount} <span className="text-base sm:text-2xl">{campaign?.asset}</span>
                            </p>
                        </div>
                        <p>
                            ${total_in_usd}
                        </p>
                    </div>
                </BackgroundField>
            </div>

        </div>
        <div className=" rounded-lg shadow-lg border border-[#404040] hover:border-[#404040] transition duration-200">
            <BackgroundField header={
                <>
                    <p className="flex items-center"><span>{campaign?.asset} pool</span>
                        <ClickTooltip text={`The amount of ${campaign?.asset} to be distributed during this round of the campaign.`} />
                    </p>
                </>
            } withoutBorder>
                <div className="flex flex-col w-full gap-2">
                    <Progress value={DistributedAmount === Infinity ? 0 : DistributedAmount} />
                    <div className="flex justify-between w-full font-semibold text-sm ">
                        <div className=""><span className="">{campaign?.distributed_amount.toFixed(0)}</span> <span>/</span> {totalBudget} {campaign?.asset}</div>
                    </div>
                </div>
            </BackgroundField>
        </div>
        {
            payouts.length > 0 &&
            <div className="space-y-1">
                <p className="font-bold text-lg text-left">Payouts</p>
                <div className="  divide-y divide-muted-3 rounded-lg shadow-lg border border-[#404040] hover:border-[#404040] transition duration-200">
                    <div className="inline-block min-w-full align-middle">
                        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                            <table className="min-w-full divide-y divide-muted-3">
                                <thead className="">
                                    <tr>
                                        <th scope="col" className="py-3.5 pl-4 text-left text-sm font-semibold  sm:pl-6">
                                            Tx Id
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold ">
                                            Amount
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold ">
                                            Date
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-muted-3">
                                    {payouts.map((payout) => (
                                        <tr key={payout.transaction_id}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium  sm:pl-6 underline hover:no-underline">
                                                <a target={"_blank"} href={network?.transaction_explorer_template?.replace("{0}", payout.transaction_id)}>{shortenAddress(payout.transaction_id)}</a>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-100">{payout.amount}</td>
                                            <td className="px-3 py-4 text-sm text-gray-100">{new Date(payout.date).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        }
    </>
}
export default Rewards
