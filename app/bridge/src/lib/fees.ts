import { GetDefaultAsset } from "../util/settingsHelper";
import { type CryptoNetwork, type NetworkCurrency } from "../Models/CryptoNetwork";

export function CalculateMinimalAuthorizeAmount(usd_price: number, amount: number) {
    return Math.ceil((usd_price * amount) + (usd_price * amount * 0.02))
}
type RefuelCalcResult = {
    refuelAmountInSelectedCurrency: number,
    refuelAmountInNativeCurrency: number
}
type CaluclateRefuelArgs = {
    currency?: NetworkCurrency | null,
    to?: CryptoNetwork | null,
    refuelEnabled?: boolean,
}

export function CaluclateRefuelAmount(args: CaluclateRefuelArgs): RefuelCalcResult {
    const res = { refuelAmountInSelectedCurrency: 0, refuelAmountInNativeCurrency: 0 }
    const refuelNetwork = ResolveRefuelNetwork(args)
    if (!refuelNetwork)
        return res
    const nativeAsset = args.to?.currencies?.find(c => c.is_native)
    if (!nativeAsset || !args.currency)
        return res
    // const refuel_amount_in_usd = Number(refuelNetwork.refuel_amount_in_usd)
    // res.refuelAmountInSelectedCurrency = refuel_amount_in_usd / args?.currency.price_in_usd || 0;
    // res.refuelAmountInNativeCurrency = (refuel_amount_in_usd / nativeAsset.price_in_usd) || 0
    res.refuelAmountInSelectedCurrency = 0;
    res.refuelAmountInNativeCurrency = 0
    return res;
}

function ResolveRefuelNetwork(args: CaluclateRefuelArgs): CryptoNetwork | undefined |null {
    const { currency, to, refuelEnabled } = args

    if (!currency || !to || !refuelEnabled)
        return
    const destinationNetwork = to

    const destinationNetworkCurrency = GetDefaultAsset(to, currency?.asset)
    const destinationNetworkNativeAsset = to.currencies?.find(c => c.is_native);

    if (!destinationNetworkCurrency || !destinationNetworkNativeAsset)
        return

    if (destinationNetworkCurrency.is_refuel_enabled && currency.price_in_usd > 0 && destinationNetworkNativeAsset.price_in_usd > 0) {
        return destinationNetwork
    }
}