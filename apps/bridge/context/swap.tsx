"use client";

import {
  Context,
  useCallback,
  useEffect,
  useState,
  createContext,
  useContext,
  useMemo,
} from "react";
import { SwapFormValues } from "../components/DTOs/SwapFormValues";
import BridgeApiClient, {
  CreateSwapParams,
  SwapItem,
  PublishedSwapTransactions,
  SwapTransaction,
  WithdrawType,
} from "../lib/BridgeApiClient";
import { useRouter } from "next/router";
import { useSettingsState } from "./settings";
import { QueryParams } from "../Models/QueryParams";
import useSWR, { KeyedMutator } from "swr";
import { ApiResponse } from "../Models/ApiResponse";
import { Partner } from "../Models/Partner";
import { ApiError } from "../Models/ApiError";
import { ResolvePollingInterval } from "../components/utils/SwapStatus";
import { NetworkCurrency } from "../Models/CryptoNetwork";
import { logger } from "ethers";

export const SwapDataStateContext = createContext<SwapData>({
  codeRequested: false,
  swap: undefined,
  addressConfirmed: false,
  depositeAddressIsfromAccount: false,
  withdrawType: undefined,
  swapTransaction: undefined,
  selectedAssetNetwork: undefined,
});
export const SwapDataUpdateContext = createContext<UpdateInterface | null>(
  null
);

export type UpdateInterface = {
  createSwap: (
    values: SwapFormValues,
    query: QueryParams,
    partner?: Partner
  ) => Promise<string | undefined>;
  setCodeRequested: (codeSubmitted: boolean) => void;
  cancelSwap: (swapId: string) => Promise<void>;
  setAddressConfirmed: (value: boolean) => void;
  setInterval: (value: number) => void;
  mutateSwap: KeyedMutator<ApiResponse<SwapItem>>;
  setDepositeAddressIsfromAccount: (value: boolean) => void;
  setWithdrawType: (value: WithdrawType) => void;
  setSelectedAssetNetwork: (assetNetwork: NetworkCurrency) => void;
  setSwapId: (value: string) => void;
};

export type SwapData = {
  codeRequested: boolean;
  swap?: SwapItem;
  swapApiError?: ApiError;
  addressConfirmed: boolean;
  depositeAddressIsfromAccount: boolean;
  withdrawType: WithdrawType | undefined;
  swapTransaction: SwapTransaction | undefined;
  selectedAssetNetwork: NetworkCurrency | undefined;
};

export function SwapDataProvider({
  id,
  children,
}: {
  id?: string;
  children: any;
}) {
  const [addressConfirmed, setAddressConfirmed] = useState<boolean>(false);
  const [codeRequested, setCodeRequested] = useState<boolean>(false);
  const [withdrawType, setWithdrawType] = useState<WithdrawType>();
  const [depositeAddressIsfromAccount, setDepositeAddressIsfromAccount] =
    useState<boolean>();
  const router = useRouter();
  const [swapId, setSwapId] = useState<string | undefined>(
    id || router.query.swapId?.toString()
  );
  const { layers, getExchangeNetwork } = useSettingsState();

  const client = new BridgeApiClient();
  const apiVersion = BridgeApiClient.apiVersion;
  const swap_details_endpoint = `/swaps/${swapId}?version=${apiVersion}`;
  console.log({ swap_details_endpoint })
  const [interval, setInterval] = useState(0);
  const {
    data: swapResponse,
    mutate,
    error,
  } = useSWR<ApiResponse<SwapItem>>(
    swapId ? swap_details_endpoint : null,
    client.fetcher,
    { refreshInterval: interval }
  );
  console.log("swapResponse ============>", swapResponse, swap_details_endpoint);

  const [swapTransaction, setSwapTransaction] = useState<SwapTransaction>();
  const source_exchange = layers.find(
    (n) =>
      n?.internal_name?.toLowerCase() ===
      swapResponse?.data?.source_exchange?.toLowerCase()
  );

  const exchangeAssets = source_exchange?.assets?.filter(
    (a) => a?.asset === swapResponse?.data?.source_asset
  );
  const source_network = layers.find(
    (n) =>
      n.internal_name?.toLowerCase() ===
      swapResponse?.data?.source_network?.toLowerCase()
  );
  const defaultSourceNetwork =
    exchangeAssets?.[0] || source_network?.assets?.[0];
  const [selectedAssetNetwork, setSelectedAssetNetwork] = useState<
    NetworkCurrency | undefined
  >(defaultSourceNetwork);

  const swapStatus = swapResponse?.data?.status;
  useEffect(() => {
    if (swapStatus) setInterval(ResolvePollingInterval(swapStatus));
    return () => {
      setInterval(0);
    };
  }, [swapStatus]);

  useEffect(() => {
    setSelectedAssetNetwork(defaultSourceNetwork);
  }, [defaultSourceNetwork]);

  // useEffect(() => {
  //     if (!swapId)
  //         return
  //     const data: PublishedSwapTransactions = JSON.parse(localStorage.getItem('swapTransactions') || "{}")
  //     const txForSwap = data.state.swapTransactions?.[swapId];
  //     setSwapTransaction(txForSwap)
  //     setSwapTransaction({
  //         hash: '1234',
  //         status: 0
  //     })
  // }, [swapId])

  const createSwap = useCallback(
    async (values: SwapFormValues, query: QueryParams, partner: Partner) => {
      if (!values) throw new Error("No swap data");

      const {
        to,
        fromCurrency,
        currencyGroup,
        toCurrency,
        from,
        refuel,
        fromExchange,
        toExchange,
      } = values;

      if (
        (!values.from && !values.fromExchange) || (!values.fromCurrency && !values.currencyGroup) ||
        (!values.to && !values.toExchange) || (!values.toCurrency && !values.currencyGroup) ||
        !values.amount ||
        !values.destination_address
      ) {
        throw new Error("Form data is missing");
      }

      const data: CreateSwapParams = {
        amount: Number(values.amount),
        source_network: from?.internal_name ?? getExchangeNetwork(layers, fromExchange, fromCurrency?.asset ?? (currencyGroup?.name as string))?.internal_name,
        source_exchange: fromExchange?.internal_name,
        source_asset: fromCurrency?.asset ?? (currencyGroup?.name as string),
        source_address: values.destination_address,
        destination_network: to?.internal_name ?? (toExchange?.internal_name as string),
        destination_exchange: toExchange?.internal_name,
        destination_asset: toCurrency?.asset ?? (currencyGroup?.name as string),
        destination_address: values.destination_address,
        refuel: !!refuel,
        use_deposit_address: true,

        app_name: partner
          ? query?.appName
          : apiVersion === "sandbox"
            ? "BridgeSandbox"
            : "Bridge",
        reference_id: query.externalId,
      };

      console.log("swap data ===========", data);

      const swapResponse = await client.CreateSwapAsync(data);
      if (swapResponse?.error) {
        throw swapResponse?.error;
      }
      console.log(swapResponse);
      const swapId = swapResponse?.data?.swap_id;
      return swapId;
    },
    []
  );

  const cancelSwap = useCallback(
    async (swapId: string) => {
      await client.CancelSwapAsync(swapId);
    },
    [router]
  );

  const updateFns: UpdateInterface = {
    createSwap: createSwap,
    setCodeRequested: setCodeRequested,
    cancelSwap: cancelSwap,
    setAddressConfirmed: setAddressConfirmed,
    setInterval: setInterval,
    mutateSwap: mutate,
    setDepositeAddressIsfromAccount,
    setWithdrawType,
    setSelectedAssetNetwork,
    setSwapId,
  };
  return (
    <SwapDataStateContext.Provider
      value={{
        withdrawType,
        codeRequested,
        addressConfirmed,
        swapTransaction,
        selectedAssetNetwork,
        depositeAddressIsfromAccount: !!depositeAddressIsfromAccount,
        swap: swapResponse?.data,
        swapApiError: error,
      }}
    >
      <SwapDataUpdateContext.Provider value={updateFns}>
        {children}
      </SwapDataUpdateContext.Provider>
    </SwapDataStateContext.Provider>
  );
}

export function useSwapDataState() {
  const data = useContext(SwapDataStateContext);

  if (data === undefined) {
    throw new Error("swapData must be used within a SwapDataProvider");
  }
  return data;
}

export function useSwapDataUpdate() {
  const updateFns = useContext<UpdateInterface>(
    SwapDataUpdateContext as Context<UpdateInterface>
  );
  if (updateFns === undefined) {
    throw new Error("useSwapDataUpdate must be used within a SwapDataProvider");
  }

  return updateFns;
}
