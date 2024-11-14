"use client";

import { type Context, useContext, createContext, type PropsWithChildren} from "react";
import { QueryParams } from "@/Models/QueryParams";

export const QueryStateContext = createContext<QueryParams | null>(null);

const QueryProvider: React.FC<{ 
  query: QueryParams 
} & PropsWithChildren> = ({
  query,
  children,
}) => {
  return (
    <QueryStateContext.Provider value={mapLegacyQueryParams(query)}>
      {children}
    </QueryStateContext.Provider>
  );
};

function mapLegacyQueryParams(params: QueryParams): QueryParams {
  return {
    ...params,
    ...(params.sourceExchangeName ? { from: params.sourceExchangeName } : {}),
    ...(params.destNetwork ? { to: params.destNetwork } : {}),
    ...(params.lockExchange ? { lockFrom: params.lockExchange } : {}),
    ...(params.lockNetwork ? { lockTo: params.lockNetwork } : {}),
    ...(params.addressSource ? { appName: params.addressSource } : {}),
    ...(params.asset ? { toAsset: params.asset } : {}),
  };
}

export function useQueryState() {
  const data = useContext<QueryParams>(
    QueryStateContext as Context<QueryParams>
  );

  if (data === undefined) {
    throw new Error("useQueryState must be used within a QueryStateProvider");
  }

  return data;
}

export default QueryProvider;
