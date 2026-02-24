import React from 'react'

import CampaignDetails from '@/components/Campaigns/Details'

export const dynamic = 'force-dynamic'

const CampaignPage: React.FC<{
  params: { campaign: string }
}> = ({ 
  params: { campaign }
}) => (
  <CampaignDetails campaign={campaign}/> 
)

export default CampaignPage
