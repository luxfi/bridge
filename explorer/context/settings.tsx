'use client'

import BridgeApiClient from '@/lib/BridgeApiClient';
import { ApiResponse } from '@/models/ApiResponse';
import { BridgeAppSettings } from '@/models/BridgeAppSettings';
import { BridgeSettings } from '@/models/BridgeSettings';
import react, { FC, ReactNode } from 'react'

import useSWR from 'swr';

const SettingsStateContext = react.createContext<BridgeAppSettings | null>(null);

export const SettingsProvider: FC<{ children: ReactNode }> = ({ children }) => {

  const fetcher = (url: string) => fetch(url).then(r => r.json());
  const version = process.env.NEXT_PUBLIC_API_VERSION;
  const { data: settings } = useSWR<ApiResponse<BridgeSettings>>(`https://bridge.lux.network/api/settings?version=${version}`, fetcher, { dedupingInterval: 60000 });

  let appSettings = new BridgeAppSettings(settings?.data);

  return (
      <SettingsStateContext.Provider value={appSettings}>
        {children}
      </SettingsStateContext.Provider>
  );
}

export function useSettingsState() {
  const data = react.useContext(SettingsStateContext);

  if (data === undefined) {
    throw new Error('useSettingsState must be used within a SettingsProvider');
  }

  return data;
}
