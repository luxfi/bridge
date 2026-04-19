import CampaignDetails from '@/components/Campaigns/Details'

export default function CampaignDetailPage({ params }: { params: { campaign: string } }) {
  return <CampaignDetails campaign={params.campaign} />
}
