'use client'

import React, { ReactNode } from 'react'
import useSWR from 'swr';
import AppSettings from '@/lib/AppSettings';
import { ApiResponse } from '@/models/ApiResponse';
import { CryptoNetwork } from '@/models/CryptoNetwork';
import { BridgeAppSettings } from '@/models/BridgeAppSettings';

const SettingsContext = React.createContext<BridgeAppSettings | null>(null);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {

  const fetcher = (url: string) => fetch(url).then(r => r.json());
  const version = AppSettings.ApiVersion;

  const { data: netWorkData } = useSWR<ApiResponse<CryptoNetwork[]>>(`${AppSettings.BridgeApiUri}/networks?version=${version}`, fetcher, { dedupingInterval: 60000 })
  const { data: exchangeData } = useSWR<ApiResponse<CryptoNetwork[]>>(`${AppSettings.BridgeApiUri}/exchanges?version=${version}`, fetcher, { dedupingInterval: 60000 })

  const settings = {
    networks: netWorkData?.data,
    exchanges: exchangeData?.data,
  }

  console.log("settings::::::", settings)

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