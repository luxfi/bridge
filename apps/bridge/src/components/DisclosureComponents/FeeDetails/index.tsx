
'use client'
import { type SwapFormValues } from '../../DTOs/SwapFormValues';
import ReceiveAmounts from './ReceiveAmounts';
import DetailedEstimates from './DetailedEstimates';
import { useFee } from '@/context/feeContext';
import { useSettings } from '@/context/settings';
import RefuelToggle from './Refuel';
//import CEXNetworkFormField from '../../Input/CEXNetworkFormField';
import FeeDetails from './FeeDetailsComponent';
import { useQueryState } from '@/context/query';
import CampaignComponent from './Campaign';
import type React from 'react'

const FeeDetailsComponent: React.FC<{ values: SwapFormValues }> = ({ 
  values 
}) => {

  const { toCurrency, from, to, refuel, fromExchange, toExchange } = values || {};
  const { fee } = useFee()
  const currency = toCurrency
  const { layers } = useSettings()
  const query = useQueryState();

  return (<>
    <FeeDetails>
        {/* {
            ((fromExchange || toExchange) && (from || to)) &&
            <FeeDetails.Item>
                <CEXNetworkFormField direction={fromExchange ? 'from' : 'to'} />
            </FeeDetails.Item>
        } */}
        {to && toCurrency && to.assets.find(a => a.asset === toCurrency.asset)?.is_refuel_enabled && !query?.hideRefuel &&
          <FeeDetails.Item>
              <RefuelToggle />
          </FeeDetails.Item>
        }
        {from && to &&
          <FeeDetails.Item>
              <DetailedEstimates
                  networks={layers}
                  selected_currency={currency}
                  source={from}
                  destination={to}
              />
          </FeeDetails.Item>
        }

        <FeeDetails.Item>
            <ReceiveAmounts
                currency={currency}
                to={to}
                receive_amount={fee.walletReceiveAmount}
                refuel={!!refuel}
            />
        </FeeDetails.Item>

    </FeeDetails>
    {values.to && values.toCurrency && (
      <CampaignComponent
          destination={values.to}
          selected_currency={values.toCurrency}
          fee={fee.walletFee}
      />
    )}
  </>)
}

export default FeeDetailsComponent
