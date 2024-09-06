'use client'

import React, { Context, FC } from 'react'
import { BridgeAppSettings } from '../Models/BridgeAppSettings';

export const SettingsStateContext = React.createContext<BridgeAppSettings | null>(null);

export const SettingsProvider: FC<{ data: BridgeAppSettings, children?: React.ReactNode }> = ({ children, data }) => {
  return (
    <SettingsStateContext.Provider value={data}>
      {children}
    </SettingsStateContext.Provider>
  );
}

export function useSettingsState() {
  const data = React.useContext<BridgeAppSettings>(SettingsStateContext as Context<BridgeAppSettings>);

  if (data === undefined) {
    throw new Error('useSettingsState must be used within a SettingsProvider');
  }

  return data;
}
