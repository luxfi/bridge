"use client";

import { type Context, type PropsWithChildren, createContext, useContext} from "react";
import { BridgeAppSettings } from "@/Models/BridgeAppSettings";

export const SettingsStateContext = createContext<BridgeAppSettings | null>(null);

export const SettingsProvider: React.FC<{
  data: BridgeAppSettings;
} & PropsWithChildren> = ({ children, data }) => {
  return (
    <SettingsStateContext.Provider value={data}>
      {children}
    </SettingsStateContext.Provider>
  );
};

export function useSettingsState() {
  const data = useContext<BridgeAppSettings>(
    SettingsStateContext as Context<BridgeAppSettings>
  );
  // console.log("::app settings:", Object.keys(data));
  if (data === undefined) {
    throw new Error("useSettingsState must be used within a SettingsProvider");
  }

  return data;
}
