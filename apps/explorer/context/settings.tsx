'use client'

import AppSettings from '@/lib/AppSettings';
import { ApiResponse } from '@/models/ApiResponse';
import { CryptoNetwork } from '@/models/CryptoNetwork';
import { BridgeAppSettings } from '@/models/BridgeAppSettings';
import React, { ReactNode } from 'react'
import useSWR from 'swr';

const SettingsContext = React.createContext<BridgeAppSettings | null>(null);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {

  const fetcher = (url: string) => fetch(url).then(r => r.json());
  // const version = process.env.NEXT_PUBLIC_API_VERSION;
  const version = 'sandbox'

  const { data: netWorkData } = useSWR<ApiResponse<CryptoNetwork[]>>(`${AppSettings.BridgeApiUri}/api/networks?version=${version}`, fetcher, { dedupingInterval: 60000 })
  const { data: exchangeData } = useSWR<ApiResponse<CryptoNetwork[]>>(`${AppSettings.BridgeApiUri}/api/exchanges?version=${version}`, fetcher, { dedupingInterval: 60000 })

  const settings = {
    networks: netWorkData?.data,
    exchanges: exchangeData?.data,
  }

  let appSettings = new BridgeAppSettings(settings);

  return (
    <SettingsContext.Provider value={appSettings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const data = React.useContext(SettingsContext);

  if (data === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }

  return data;
}