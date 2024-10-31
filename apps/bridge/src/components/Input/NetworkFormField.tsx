"use client";
import React, { forwardRef, useCallback, useEffect, useState } from "react";
import { useFormikContext } from "formik";
import useSWR from "swr";

import { useSettings } from "@/context/settings";
import { type SwapFormValues } from "../DTOs/SwapFormValues";
import {
  type ISelectMenuItem,
  SelectMenuItem,
} from "../Select/Shared/Props/selectMenuItem";
import { type Layer } from "@/Models/Layer";
import CommandSelectWrapper from "../Select/Command/CommandSelectWrapper";
import ExchangeSettings from "@/lib/ExchangeSettings";
import { SortingByOrder } from "@/lib/sorting";
import { LayerDisabledReason } from "../Select/Popover/PopoverSelect";
import NetworkSettings from "@/lib/NetworkSettings";
import { SelectMenuItemGroup } from "../Select/Command/commandSelect";
import { useQueryState } from "@/context/query";
import CurrencyFormField from "./CurrencyFormField";
import { ApiResponse } from "@/Models/ApiResponse";
import BridgeApiClient from "@/lib/BridgeApiClient";
import { type NetworkCurrency } from "@/Models/CryptoNetwork";
import { type Exchange } from "@/Models/Exchange";
import CurrencyGroupFormField from "./CEXCurrencyFormField";
import AmountField from "./Amount";
import { Refuel } from "../DisclosureComponents/FeeDetails/ReceiveAmounts";
import { useFee } from "@/context/feeContext";

type SwapDirection = "from" | "to";
type Props = {
  direction: SwapDirection;
  label: string;
  className?: string;
};
const GROUP_ORDERS = {
  Popular: 1,
  New: 2,
  Fiat: 3,
  Networks: 4,
  Exchanges: 5,
  Other: 10,
}

type OrderType = keyof typeof GROUP_ORDERS

const getGroupName = (value: Layer | Exchange, type: "cex" | "layer") => {
  if (value.is_featured) {
    return "Popular";
  } else if (
    new Date(value.created_date).getTime() >=
    new Date().getTime() - 2629800000
  ) {
    return "New";
  } else if (type === "layer") {
    return "Networks";
  } else if (type === "cex") {
    return "Exchanges";
  } else {
    return "Other";
  }
};

const NetworkFormField = forwardRef(function NetworkFormField(
  { direction, label, className }: Props,
  ref: any
) {
  const { values, setFieldValue } = useFormikContext<SwapFormValues>();
  const name = direction;
  const {
    from,
    to,
    fromCurrency,
    toCurrency,
    fromExchange,
    toExchange,
    currencyGroup,
    refuel,
  } = values;
  const { lockFrom, lockTo } = useQueryState();

  const { resolveImgSrc, layers, exchanges } = useSettings();

  let placeholder = "";
  let searchHint = "";
  let filteredLayers: Layer[];
  let filteredExchanges: Exchange[];
  let menuItems: SelectMenuItem<Layer | Exchange>[];

  let valueGrouper: (values: ISelectMenuItem[]) => SelectMenuItemGroup[];

  const filterWith = direction === "from" ? to : from;
  const filterWithAsset = direction === "from" ? toCurrency?.asset : fromCurrency?.asset;
  const filterWithExchange = direction === "from" ? toExchange : fromExchange;

  const apiClient = new BridgeApiClient();
  const version = BridgeApiClient.apiVersion;

  const routesEndpoint = `/${
    direction === "from" ? "sources" : "destinations"
  }${
    filterWith
      ? `?${direction === "to" ? "source_network" : "destination_network"}=${
          filterWith.internal_name
        }&${
          direction === "to" ? "source_asset" : "destination_asset"
        }=${filterWithAsset}&`
      : filterWithExchange
      ? `?${
          direction === "from"
            ? "destination_asset_group"
            : "source_asset_group"
        }=${filterWithExchange?.internal_name}&`
      : "?"
  }version=${version}`;

  const { data: routes, isLoading } = useSWR<
    ApiResponse<
      {
        network: string;
        asset: string;
      }[]
    >
  >(routesEndpoint, apiClient.fetcher);

  const [routesData, setRoutesData] = useState<
    {
      network: string;
      asset: string;
    }[]
  >();

  useEffect(() => {
    if (!isLoading && routes?.data) setRoutesData(routes?.data);
  }, [routes]);

  if (direction === "from") {
    placeholder = "Source";
    searchHint = "Swap from";
    filteredLayers = layers.filter(
      (l) =>
        // l.internal_name !== filterWith?.internal_name &&
        routesData?.some((r) => r.network === l.internal_name)
    );
    filteredExchanges = exchanges.filter(
      (e) =>
        // e.internal_name !== filterWith?.internal_name &&
        routesData?.some((r) => r.network === e.internal_name)
    );
    menuItems = GenerateMenuItems(
      filteredLayers,
      toExchange ? [] : exchanges,
      resolveImgSrc,
      direction,
      !!(from && lockFrom)
    );
  } else {
    placeholder = "Destination";
    searchHint = "Swap to";
    filteredLayers = layers.filter(
      (l) =>
        routesData?.some((r) => r.network === l.internal_name) &&
        l.internal_name !== filterWith?.internal_name
    );
    filteredExchanges = exchanges.filter(
      (e) =>
        routesData?.some((r) => r.network === e.internal_name) &&
        e.internal_name !== filterWith?.internal_name
    );
    menuItems = GenerateMenuItems(
      filteredLayers,
      fromExchange ? [] : filteredExchanges, // cex -> net
      resolveImgSrc,
      direction,
      !!(to && lockTo)
    );
  }
  valueGrouper = groupByType;

  const value = menuItems.find((x) =>
    x.type === "layer"
      ? x.id == (direction === "from" ? from : to)?.internal_name
      : x.id ==
      (direction === "from" ? fromExchange : toExchange)?.internal_name
  );

  const handleSelect = useCallback(
    (item: SelectMenuItem<Layer | Exchange>) => {
      if (item.type === "cex") {
        setFieldValue(`${name}Exchange`, item.baseObject, true);
        setFieldValue(name, null, true);
        setFieldValue(`currencyGroup`, null, true);
        setFieldValue(`${name}Currency`, null, true);
      } else {
        setFieldValue(name, item.baseObject, true);
        setFieldValue(`${name}Exchange`, null, true);
        setFieldValue(`${name}Currency`, null, true);
      }
    },
    [name]
  );

  const { fee } = useFee();

  const parsedReceiveAmount = parseFloat(
    fee.manualReceiveAmount?.toFixed(toCurrency?.precision ?? 6) || ""
  );
  const destinationNetworkCurrency = to && toCurrency ? toCurrency : null;

  return (
    <div className={`p-3 ${className}`}>
      <label htmlFor={name} className="block font-semibold text-xs">
        {label}
      </label>
      <div className="border border-[#404040] bg-level-1 rounded-lg mt-1.5 pb-2">
        <div ref={ref}>
          <div className="w-full">
            <CommandSelectWrapper
              disabled={false}
              valueGrouper={valueGrouper}
              placeholder={placeholder}
              setValue={handleSelect as (v: ISelectMenuItem) => void}
              value={value}
              values={menuItems}
              searchHint={searchHint}
              className="rounded-b-none border-t-0 border-x-0"
            />
          </div>
        </div>
        <div className="flex justify-between items-center mt-2 pl-3 pr-4">
          {direction === "from" ? (
            <AmountField />
          ) : parsedReceiveAmount > 0 ? (
            <div className="font-semibold md:font-bold text-right leading-4">
              <p>
                <span>{parsedReceiveAmount}</span>&nbsp;
                <span>{destinationNetworkCurrency?.asset}</span>
              </p>
              {refuel && (
                <Refuel currency={toCurrency} to={to} refuel={refuel} />
              )}
            </div>
          ) : (
            <>-</>
          )}
          {value?.type === "cex" ? (
            <CurrencyGroupFormField direction={name} />
          ) : (
            <CurrencyFormField direction={name} />
          )}
        </div>
      </div>
    </div>
  );
});

function groupByType(values: ISelectMenuItem[]) {
  let groups: SelectMenuItemGroup[] = [];
  values.forEach((v) => {
    let group =
      groups.find((x) => x.name == v.group) ||
      new SelectMenuItemGroup({ name: v.group, items: [] });
    group.items.push(v);
    if (!groups.find((x) => x.name == v.group)) {
      groups.push(group);
    }
  });

  groups.forEach((group) => {
    group.items.sort((a, b) => a.name.localeCompare(b.name));
  });

  groups.sort((a: SelectMenuItemGroup, b: SelectMenuItemGroup) => {
    // Sort put networks first then exchanges
    return (
      (GROUP_ORDERS[a.name as OrderType] || GROUP_ORDERS.Other) -
      (GROUP_ORDERS[b.name as OrderType] || GROUP_ORDERS.Other)
    );
  });

  return groups;
}

function GenerateMenuItems(
  layers: Layer[],
  exchanges: Exchange[],
  resolveImgSrc: (item: Layer | Exchange | NetworkCurrency) => string,
  direction: SwapDirection,
  lock: boolean
): SelectMenuItem<Layer | Exchange>[] {
  let layerIsAvailable = () => {
    if (lock) {
      return {
        value: false,
        disabledReason: LayerDisabledReason.LockNetworkIsTrue,
      };
    } else {
      return { value: true, disabledReason: null };
    }
  };

  const mappedLayers = layers
    .map((l) => {
      let orderProp: keyof NetworkSettings | keyof ExchangeSettings =
        direction == "from" ? "OrderInSource" : "OrderInDestination";
      const order = NetworkSettings.KnownSettings[l.internal_name]?.[orderProp];
      const res: SelectMenuItem<Layer> = {
        baseObject: l,
        id: l.internal_name,
        name: l.display_name,
        order: order || 100,
        imgSrc: resolveImgSrc && resolveImgSrc(l),
        isAvailable: layerIsAvailable(),
        type: "layer",
        group: getGroupName(l, "layer"),
      };
      return res;
    })
    .sort(SortingByOrder);

  const mappedExchanges = exchanges
    .map((e) => {
      let orderProp: keyof ExchangeSettings =
        direction == "from" ? "OrderInSource" : "OrderInDestination";
      const order =
        ExchangeSettings.KnownSettings[e.internal_name]?.[orderProp];
      const res: SelectMenuItem<Exchange> = {
        baseObject: e,
        id: e.internal_name,
        name: e.display_name,
        order: order || 100,
        imgSrc: resolveImgSrc && resolveImgSrc(e),
        isAvailable: layerIsAvailable(),
        type: "cex",
        group: getGroupName(e, "cex"),
      };
      return res;
    })
    .sort(SortingByOrder);
  const items = [...mappedExchanges, ...mappedLayers];
  return items;
}

export default NetworkFormField;
