"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormikContext } from "formik";

import useSWR from "swr";

import { useSettings } from "@/context/settings";
import { type SwapFormValues } from "../DTOs/SwapFormValues";
import { SelectMenuItem, type ISelectMenuItem } from "../Select/Shared/Props/selectMenuItem";
import PopoverSelectWrapper from "../Select/Popover/PopoverSelectWrapper";
import CurrencySettings from "@/lib/CurrencySettings";
import { SortingByAvailability } from "@/lib/sorting";
import { type Layer } from "@/Models/Layer";
import { useBalancesState } from "@/context/balances";
import { truncateDecimals } from "../utils/RoundDecimals";
import { useQueryState } from "@/context/query";
import { type NetworkCurrency } from "@/Models/CryptoNetwork";
import BridgeApiClient from "@/lib/BridgeApiClient";
import { ApiResponse } from "@/Models/ApiResponse";
import useWallet from "@/hooks/useWallet";
import { type Balance } from "@/Models/Balance";

const CurrencyFormField: React.FC<{ 
  direction: string 
}> = ({ 
  direction 
}) => {

  const { values, setFieldValue } = useFormikContext<SwapFormValues>();
  const { to, fromCurrency, toCurrency, from, currencyGroup } = values;

  const [allRoutes, setAllRoutes] = useState<string[]>([]);
  const { resolveImgSrc } = useSettings();
  const name = direction === "from" ? "fromCurrency" : "toCurrency";
  const query = useQueryState();
  const { balances, isBalanceLoading } = useBalancesState();
  const lockedCurrency = query?.lockAsset
    ? from?.assets?.find(
      (c) => c?.asset?.toUpperCase() === query?.asset?.toUpperCase()
    )
    : undefined;
  const assets = direction === "from" ? from?.assets : to?.assets;
  const { getAutofillProvider: getProvider } = useWallet();
  const provider = useMemo(() => {
    return from && getProvider(from);
  }, [from, getProvider]);

  const wallet = provider?.getConnectedWallet();
  const walletBalance =
    wallet &&
    balances[wallet.address]?.find(
      (b) =>
        b?.network === from?.internal_name && b?.token === fromCurrency?.asset
    );
  const destinationBalance =
    wallet &&
    balances[wallet.address]?.find(
      (b) => b?.network === to?.internal_name && b?.token === toCurrency?.asset
    );

  const walletBalanceAmount =
    walletBalance?.amount &&
    truncateDecimals(walletBalance?.amount, fromCurrency?.precision);
  const destinationBalanceAmount =
    destinationBalance?.amount &&
    truncateDecimals(destinationBalance?.amount, toCurrency?.precision);
  const apiClient = new BridgeApiClient();
  const version = BridgeApiClient.apiVersion;

  //destination_currencies?source_network=BINANCE&source_asset=undefined&version=mainnet
  const destinationRoutesURL = `/destination_currencies${to ? `?destination_network=${to.internal_name}&destination_asset=${toCurrency?.asset}&` : "?"}version=${version}`;
  //source_currencies?source_network=BINANCE&source_asset=undefined&version=mainnet
  const sourceRoutesURL = `/source_currencies${from ? `?source_network=${from.internal_name}&source_asset=${fromCurrency?.asset}&` : "?"}version=${version}`;

  const { data: sourceRoutes, error: sourceRoutesError } = useSWR<
    ApiResponse<
      {
        network: string;
        asset: string;
      }[]
    >
  >(sourceRoutesURL, apiClient.fetcher);

  const { data: destinationRoutes, error: destRoutesError } = useSWR<
    ApiResponse<
      {
        network: string;
        asset: string;
      }[]
    >
  >(destinationRoutesURL, apiClient.fetcher);

  const currencies = lockedCurrency ? [lockedCurrency] : assets;

  const filteredCurrencies = currencies?.filter((currency) => {
    if (direction === "from") {
      return currency.availableInSource;
    } else {
      return currency.availableInDestination;
    }
  });

  const currencyMenuItems = GenerateCurrencyMenuItems(
    currencies!,
    resolveImgSrc,
    values,
    direction === "from" ? sourceRoutes?.data : destinationRoutes?.data,
    lockedCurrency,
    direction,
    balances[wallet?.address || ""]
  );

  const currencyAsset = direction === "from" ? fromCurrency?.asset : toCurrency?.asset;

  useEffect(() => {
    let currencyIsAvailable =
      (fromCurrency || toCurrency) &&
      currencyMenuItems?.some((c) => c?.baseObject.asset === currencyAsset);

    if (currencyIsAvailable) return;

    const default_currency =
      currencyMenuItems?.find(
        (c) =>
          c.baseObject?.asset?.toUpperCase() === query?.asset?.toUpperCase()
      ) || currencyMenuItems?.[0];
    const selected_currency = currencyMenuItems?.find(
      (c) =>
        c.baseObject?.asset?.toUpperCase() ===
        (
          currencyGroup?.name ||
          (direction === "to" ? fromCurrency?.asset : toCurrency?.asset)
        )?.toUpperCase()
    );

    if (
      direction === "to" &&
      selected_currency &&
      destinationRoutes?.data
        ?.filter((r) => r.network === to?.internal_name)
        ?.some((r) => r.asset === selected_currency.name)
    ) {
      setFieldValue(name, selected_currency.baseObject);
    } else if (
      direction === "from" &&
      selected_currency &&
      sourceRoutes?.data
        ?.filter((r) => r.network === from?.internal_name)
        ?.some((r) => r.asset === selected_currency.name)
    ) {
      setFieldValue(name, selected_currency.baseObject);
    } else if (default_currency) {
      setFieldValue(name, default_currency.baseObject);
    }
  }, [from, to, query]);

  useEffect(() => {
    if (direction === "to" && fromCurrency && toCurrency) {
      if (
        destinationRoutes &&
        !destinationRoutes?.data
          ?.filter((r) => r.network === to?.internal_name)
          ?.some((r) => r.asset === toCurrency?.asset)
      ) {
        setFieldValue(name, null);
      } else if (destRoutesError) {
        setFieldValue("toCurrency", null);
        setFieldValue("to", null);
      }
    }
  }, [fromCurrency, direction, to, destinationRoutes, destRoutesError]);

  useEffect(() => {
    if (direction === "from" && toCurrency && fromCurrency) {
      if (
        sourceRoutes?.data &&
        !sourceRoutes?.data
          ?.filter((r) => r.network === from?.internal_name)
          ?.some((r) => r.asset === fromCurrency?.asset)
      ) {
        setFieldValue(name, null);
      } else if (sourceRoutesError) {
        setFieldValue("fromCurrency", null);
        setFieldValue("from", null);
      }
    }
  }, [toCurrency, direction, from, sourceRoutes, sourceRoutesError]);

  const value = currencyMenuItems?.find((x) => x.id == currencyAsset);

  const handleSelect = useCallback(
    (item: SelectMenuItem<NetworkCurrency>) => {
      setFieldValue(name, item.baseObject, true);
    },
    [name, direction, toCurrency, fromCurrency, from, to]
  );

  const balanceAmount = direction === "from" ? walletBalanceAmount : destinationBalanceAmount;

  return (
    <div className="relative">
      {/* {(direction === 'from' ? (from && fromCurrency) : (to && toCurrency)) && balanceAmount != undefined && !isNaN(balanceAmount) &&
                <div className="text-xs text-right absolute right-0 -top-7">
                    <div className='bg-level-1 py-1.5 pl-2 text-xs'>
                        <div>
                            <span>Balance:&nbsp;</span>
                            {isBalanceLoading ?
                                <div className='h-[10px] w-10 inline-flex bg-gray-500 rounded-sm animate-pulse' />
                                :
                                <span>{balanceAmount}</span>}
                        </div>
                    </div>
                </div>
            } */}
      <PopoverSelectWrapper
        placeholder="Asset"
        values={currencyMenuItems}
        value={value}
        setValue={handleSelect as (v: ISelectMenuItem) => void}
        disabled={!value?.isAvailable?.value}
      />
    </div>
  );
};

export function GenerateCurrencyMenuItems(
  currencies: NetworkCurrency[],
  resolveImgSrc: (item: Layer | NetworkCurrency) => string,
  values: SwapFormValues,
  routes?: { network: string; asset: string }[],
  lockedCurrency?: NetworkCurrency,
  direction?: string,
  balances?: Balance[]
): SelectMenuItem<NetworkCurrency>[] {
  const { to, from } = values;

  let currencyIsAvailable = (currency: NetworkCurrency) => {
    if (lockedCurrency) {
      return {
        value: false,
        disabledReason: CurrencyDisabledReason.LockAssetIsTrue,
      };
    } else if (
      (from || to) &&
      !routes
        ?.filter(
          (r) =>
            r.network ===
            (direction === "from" ? from?.internal_name : to?.internal_name)
        )
        .some((r) => r.asset === currency.asset)
    ) {
      return {
        value: true,
        disabledReason: CurrencyDisabledReason.InvalidRoute,
      };
    } else {
      return { value: true, disabledReason: null };
    }
  };

  return currencies
    ?.map((c) => {
      const currency = c;
      const displayName = lockedCurrency?.asset ?? currency.asset;
      const balance = balances?.find(
        (b) => b?.token === c?.asset && from?.internal_name === b.network
      );
      const formatted_balance_amount = balance
        ? Number(truncateDecimals(balance?.amount, c.precision))
        : "";

      const res: SelectMenuItem<NetworkCurrency> = {
        baseObject: c,
        id: c.asset,
        name: displayName || "-",
        order: CurrencySettings.KnownSettings[c.asset]?.Order ?? 5,
        imgSrc: resolveImgSrc && resolveImgSrc(c),
        isAvailable: currencyIsAvailable(c),
        details: `${formatted_balance_amount}`,
        type: "currency",
      };

      return res;
    })
    .sort(SortingByAvailability);
}

export enum CurrencyDisabledReason {
  LockAssetIsTrue = "",
  InsufficientLiquidity = "Temporarily disabled. Please check later.",
  InvalidRoute = "Invalid route",
}

export default CurrencyFormField;
