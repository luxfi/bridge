'use client'

import { FC, useState } from "react"
import { useSettingsState } from "../../../context/settings"
import Image from 'next/image'
import { Trophy } from "lucide-react"
import BridgeApiClient, { Campaign, Leaderboard, Reward } from "../../../lib/BridgeApiClient"
import { RewardsComponentLeaderboardSceleton } from "../../Sceletons"
import useSWR from "swr"
import { ApiResponse } from "../../../Models/ApiResponse"
import ClickTooltip from "../../Tooltips/ClickTooltip"
import shortenAddress from "../../utils/ShortenAddress"
import { useAccount } from "wagmi"
import { truncateDecimals } from "../../utils/RoundDecimals"
import AddressIcon from "../../AddressIcon";
import Modal from "../../modal/modal";
import Link from "next/link";

type Props = {
    campaign: Campaign
}
const Component: FC<Props> = ({ campaign }) => {
    const [openTopModal, setOpenTopModal] = useState(false)
    const settings = useSettingsState()
    const { address } = useAccount();

    const handleOpenTopModal = () => {
        setOpenTopModal(true)
    }

    const apiClient = new BridgeApiClient()
    const { data: leaderboardData, isLoading } = useSWR<ApiResponse<Leaderboard>>(`/campaigns/${campaign?.id}/leaderboard`, apiClient.fetcher, { dedupingInterval: 60000 })
    const { data: rewardsData, isLoading: rewardsIsLoading } = useSWR<ApiResponse<Reward>>(`/campaigns/${campaign.id}/rewards/${address}`, apiClient.fetcher, { dedupingInterval: 60000 })
    const leaderboard = leaderboardData?.data

    if (isLoading) {
        return <RewardsComponentLeaderboardSceleton />
    }

    if (!leaderboard) {
        //TODO handle
        return <></>
    }

    const rewards = rewardsData?.data
    const { resolveImgSrc, layers } = settings
    const network = layers.find(n => n.internal_name === campaign?.network)
    const position = rewards?.user_reward.position || NaN
    const campaignAsset = network?.assets.find(c => c?.asset === campaign?.asset)

    const leaderboardRewards = [
        leaderboard.leaderboard_budget * 0.6,
        leaderboard.leaderboard_budget * 0.3,
        leaderboard.leaderboard_budget * 0.1
    ]

    return <div className="space-y-2">
        {leaderboard?.leaderboard?.length > 0 &&
            <div className="flex items-center justify-between">
                <p className="font-bold text-left leading-5">Leaderboard</p>
                <button onClick={handleOpenTopModal} type="button" className=" leading-4 text-base text-muted underline hover:no-underline hover:text-foreground">
                    Top 10
                </button>
            </div>}
        <p className="text-sm ">Users who earn the most throughout the program will be featured here.</p>
        <div className=" border border-[#404040] hover:border-[#404040] transition duration-200 rounded-lg shadow-lg">
            <div className="p-3">
                {leaderboard?.leaderboard?.length > 0 ? <div className="space-y-6">
                    {
                        leaderboard?.leaderboard?.filter(u => u.position < 4).map(user => (
                            <div key={user.position} className="items-center flex justify-between text-muted">
                                <div className="flex items-center">
                                    <p className="text-md font-medium w-fit mr-1 cursor-default">{user.position}.</p>
                                    <div className="cols-start-2 flex items-center space-x-2">
                                        <AddressIcon address={user.address} size={25} />
                                        <div>
                                            <div className="text-sm font-bold leading-3">
                                                {user?.address && network?.account_explorer_template && <Link target="_blank" className="hover:opacity-80" href={network?.account_explorer_template?.replace("{0}", user?.address)}>
                                                    {user?.position === rewards?.user_reward?.position ? <span className="text-primary">You</span> : shortenAddress(user?.address)}
                                                </Link>}
                                            </div>
                                            <p className="mt-1 text-sm font-medium leading-3 cursor-default">{truncateDecimals(user.amount, campaignAsset?.precision)} {campaign?.asset}</p>
                                        </div>
                                    </div >
                                </div >
                                {
                                    leaderboard.leaderboard_budget > 0 && <div className="text-right flex items-center space-x-2">
                                        <ClickTooltip text={
                                            <div className="flex items-center space-x-1">
                                                <span>+</span>
                                                <div className="h-3.5 w-3.5 relative">
                                                    <Image
                                                        src={resolveImgSrc(campaign)}
                                                        alt="Project Logo"
                                                        height="40"
                                                        width="40"
                                                        loading="eager"
                                                        className="rounded-full object-contain" />
                                                </div>
                                                <p>
                                                    <span>{leaderboardRewards[user.position - 1]} {campaign?.asset}</span>
                                                </p>
                                            </div>}>
                                            <div className='text-muted hover:cursor-pointer hover:muted-2 ml-0.5 hover:bg-level-4 active:ring-2 active:ring-gray-200 active:bg-level-3 focus:outline-none cursor-default p-1 rounded'>
                                                <Trophy className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                        </ClickTooltip>
                                    </div>
                                }
                            </div >
                        ))

                    }
                    {
                        position >= 4 && address && rewards?.user_reward &&
                        <div className={position > 4 ? "!mt-0 !pt-0" : ""}>
                            {position > 4 && < div className="text-2xl text-center leading-3  my-3">
                                ...
                            </div>}
                            <div key={position} className="items-center flex justify-between">
                                <div className="flex items-center">
                                    <p className="text-xl font-medium  w-fit mr-1 cursor-default">{position}.</p>
                                    <div className="cols-start-2 flex items-center space-x-2">
                                        <AddressIcon address={address} size={25} />
                                        <div>
                                            <div className="text-sm font-bold  leading-3">
                                                {network?.account_explorer_template && <Link target="_blank" className="hover:opacity-80" href={network?.account_explorer_template?.replace("{0}", address)}>
                                                    <span className="">You</span>
                                                </Link>}
                                            </div>
                                            <p className="mt-1 text-sm font-medium  leading-3 cursor-default">{truncateDecimals(rewards.user_reward.total_amount, campaignAsset?.precision)} {campaign?.asset}</p>
                                        </div>
                                    </div >
                                </div >
                            </div >
                        </div >
                    }
                </div >
                    :
                    <div className="h-8 flex flex-col justify-center items-center text-sm">
                        Here will be leaderboard.
                    </div>
                }
            </div >
        </div >
        <Modal height="full" header='Leaderboard' show={openTopModal} setShow={setOpenTopModal} >
            <div className="bg-background border border-[#404040] mt-2 hover:border-[#404040] transition duration-200 rounded-lg shadow-lg text-muted">
                <div className="p-3">
                    <div className="space-y-6">
                        {
                            leaderboard?.leaderboard?.map(user => (
                                <div key={user.position} className="items-center flex justify-between">
                                    <div className="flex items-center">
                                        <p className="text-md font-medium  w-fit mr-1 cursor-default">{user.position}.</p>
                                        <div className="cols-start-2 flex items-center space-x-2">
                                            <AddressIcon address={user.address} size={25} />
                                            <div>
                                                <div className="text-sm font-bold  leading-3">
                                                    {user?.address && network?.account_explorer_template && <Link target="_blank" className="hover:opacity-80" href={network?.account_explorer_template?.replace("{0}", user?.address)}>
                                                        {user.position === rewards?.user_reward?.position ? <span className="text-primary">You</span> : shortenAddress(user.address)}
                                                    </Link>}
                                                </div>
                                                <p className="mt-1 text-sm font-medium leading-3 cursor-default">{truncateDecimals(user.amount, campaignAsset?.precision)} {campaign?.asset}</p>
                                            </div>
                                        </div >
                                    </div >
                                    {
                                        user.position < 4 && leaderboard.leaderboard_budget > 0 &&
                                        <div className="text-right flex items-center space-x-2">
                                            <ClickTooltip text={
                                                <div className="flex items-center space-x-1">
                                                    <span>+</span>
                                                    <div className="h-3.5 w-3.5 relative">
                                                        <Image
                                                            src={resolveImgSrc(campaign)}
                                                            alt="Address Logo"
                                                            height="40"
                                                            width="40"
                                                            loading="eager"
                                                            className="rounded-full object-contain" />
                                                    </div>
                                                    <p>
                                                        <span>{leaderboardRewards[user.position - 1]} {campaign?.asset}</span>
                                                    </p>
                                                </div>
                                            }>
                                                <div className='hover:cursor-pointer hover:text-foreground ml-0.5 hover:bg-level-4 active:ring-2 active:ring-gray-200 active:bg-level-3 focus:outline-none cursor-default p-1 rounded'>
                                                    <Trophy className="h-4 w-4" aria-hidden="true" />
                                                </div>
                                            </ClickTooltip>
                                        </div>
                                    }
                                </div >
                            ))
                        }
                    </div >
                </div >
            </div >
        </Modal >
    </div >
}
export default Component