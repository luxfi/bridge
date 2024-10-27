import { type Layer } from "@/Models/Layer";
import { GetDefaultAsset } from "@/util/settingsHelper";
import { CaluclateRefuelAmount } from "@/lib/fees";
import { truncateDecimals } from "../../utils/RoundDecimals";
import { type NetworkCurrency } from "@/Models/CryptoNetwork";


const ReceiveAmounts: React.FC<{
  receive_amount?: number;
  currency?: NetworkCurrency | null;
  to: Layer | undefined | null;
  refuel: boolean
}> = ({ 
  receive_amount, 
  currency, 
  to, 
  refuel 
}) => {

    const parsedReceiveAmount = parseFloat(receive_amount?.toFixed(currency?.precision) || "")
    const destinationNetworkCurrency = (to && currency) ? GetDefaultAsset(to, currency.asset) : null

    return <>
        <span className="md:font-semibold text-sm md:text-base  leading-8 md:leading-8 flex-1">
            You will receive
        </span>
        <div className='flex items-center space-x-2'>
            <span className="text-sm md:text-base">
                {
                    parsedReceiveAmount > 0 ?
                        <div className="font-semibold md:font-bold text-right leading-4">
                            <p>
                                <>{parsedReceiveAmount}</>
                                &nbsp;
                                <span>
                                    {destinationNetworkCurrency?.asset}
                                </span>
                            </p>
                            {refuel && <Refuel
                                currency={currency}
                                to={to}
                                refuel={refuel}
                            />}
                        </div>
                        : '-'
                }
            </span>
        </div>
    </>
}

const Refuel: React.FC<{
  currency?: NetworkCurrency | null;
  to?: Layer | null;
  refuel: boolean
}> = ({ 
  to, 
  currency, 
  refuel 
}) => {

    const destination_native_asset = to?.assets.find(c => c.is_native)
    const refuelCalculations = CaluclateRefuelAmount({
        refuelEnabled: refuel,
        currency,
        to
    })
    const { refuelAmountInNativeCurrency } = refuelCalculations
    const truncated_refuel = truncateDecimals(refuelAmountInNativeCurrency, destination_native_asset?.precision)

    return <>
        {
            truncated_refuel > 0 ? <p className='text-[12px] text-muted-3'>
                <>+</> <span>{truncated_refuel} {destination_native_asset?.asset}</span>
            </p>
                : null
        }
    </>

}

export {
  ReceiveAmounts as default,
  Refuel
}
