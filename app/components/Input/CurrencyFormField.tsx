import { useFormikContext } from "formik";
import { FC, useCallback, useEffect, useMemo } from "react";
import { useSettingsState } from "../../context/settings";
import { SwapFormValues } from "../DTOs/SwapFormValues";
import { FilterCurrencies, GetNetworkCurrency } from "../../helpers/settingsHelper";
import { Currency } from "../../Models/Currency";
import { SelectMenuItem } from "../Select/Shared/Props/selectMenuItem";
import PopoverSelectWrapper from "../Select/Popover/PopoverSelectWrapper";
import CurrencySettings from "../../lib/CurrencySettings";
import { SortingByOrder } from "../../lib/sorting";
import { Layer } from "../../Models/Layer";
import { useBalancesState } from "../../context/balances";
import { truncateDecimals } from "../utils/RoundDecimals";
import { useQueryState } from "../../context/query";
import useWallet from "../../hooks/useWallet";
import { Balance } from "../../Models/Balance";

const CurrencyFormField: FC = () => {
    const {
        values: { to, currency, from },
        setFieldValue,
    } = useFormikContext<SwapFormValues>();

    const { resolveImgSrc, currencies } = useSettingsState();
    const name = "currency"
    const query = useQueryState()
    const { balances } = useBalancesState()
    const { getAutofillProvider: getProvider } = useWallet()
    const provider = useMemo(() => {
        return from && getProvider(from)
    }, [from, getProvider])

    const wallet = provider?.getConnectedWallet()
    const lockedCurrency = query?.lockAsset ? currencies?.find(c => c?.asset?.toUpperCase() === (query?.asset as string)?.toUpperCase()) : undefined

    const filteredCurrencies = lockedCurrency ? [lockedCurrency] : FilterCurrencies(currencies, from, to)
    const currencyMenuItems = from ? GenerateCurrencyMenuItems(
        filteredCurrencies,
        from,
        resolveImgSrc,
        lockedCurrency,
        balances[wallet?.address || '']
    ) : []

    useEffect(() => {
        const currencyIsAvailable = currency && currencyMenuItems.some(c => c?.baseObject.asset === currency?.asset)
        if (currencyIsAvailable) return

        const default_currency = currencyMenuItems.find(c => c.baseObject?.asset?.toUpperCase() === (query?.asset as string)?.toUpperCase()) || currencyMenuItems?.[0]

        if (default_currency) {
            setFieldValue(name, default_currency.baseObject)
        }
        else if (currency) {
            setFieldValue(name, null)
        }
    }, [from, to, currencies, currency, query])

    const value = currencyMenuItems.find(x => x.id == currency?.asset);
    const handleSelect = useCallback((item: SelectMenuItem<Currency>) => {
        setFieldValue(name, item.baseObject, true)
    }, [name])

    return <PopoverSelectWrapper values={currencyMenuItems} value={value} setValue={handleSelect} disabled={!value?.isAvailable?.value} />;
};

export function GenerateCurrencyMenuItems(currencies: Currency[], source: Layer, resolveImgSrc: (item: Layer | Currency) => string, lockedCurrency?: Currency, balances?: Balance[]): SelectMenuItem<Currency>[] {

    let currencyIsAvailable = () => {
        if (lockedCurrency) {
            return { value: false, disabledReason: CurrencyDisabledReason.LockAssetIsTrue }
        }
        else {
            return { value: true, disabledReason: null }
        }
    }

    return currencies.map(c => {
        const sourceCurrency = GetNetworkCurrency(source, c.asset);
        const displayName = lockedCurrency?.asset ?? (source?.isExchange ? sourceCurrency?.asset : sourceCurrency?.name);
        const balance = balances?.find(b => b?.token === c?.asset && source.internal_name === b.network)
        const formatted_balance_amount = balance ? Number(truncateDecimals(balance?.amount, c.precision)) : ''

        const res: SelectMenuItem<Currency> = {
            baseObject: c,
            id: c.asset,
            name: displayName || "-",
            order: CurrencySettings.KnownSettings[c.asset]?.Order ?? 5,
            imgSrc: resolveImgSrc && resolveImgSrc(c),
            isAvailable: currencyIsAvailable(),
            details: `${formatted_balance_amount}`
        };
        return res
    }).sort(SortingByOrder);
}

export enum CurrencyDisabledReason {
    LockAssetIsTrue = '',
    InsufficientLiquidity = 'Temporarily disabled. Please check later.'
}

export default CurrencyFormField