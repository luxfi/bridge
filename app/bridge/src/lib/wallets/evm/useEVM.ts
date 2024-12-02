'use client'
import { useEffect, useRef } from "react";

import { createModal } from "@rabby-wallet/rabbykit";
import { useAccount, useConfig, useDisconnect} from "wagmi";

import { NetworkType } from "../../../Models/CryptoNetwork";
import { type WalletProvider } from "../../../hooks/useWallet";
import KnownInternalNames from "../../knownIds";
import { ResolveEVMWalletIcon } from "./resolveEVMIcon";
import { useSettings } from "../../../context/settings-provider"

const name = "evm";

  // cf: @luxfi/luxkit:examples/next-wagmi/src/components/Connect.tsx
export default function useEVM(): WalletProvider {

  const { networks } = useSettings()
  const account = useAccount();
  const { disconnect } = useDisconnect();

  const rabbyKitRef = useRef<ReturnType<typeof createModal>>();
  const config = useConfig();

  useEffect(() => {
    if (!rabbyKitRef.current) {
      rabbyKitRef.current = createModal({
        showWalletConnect: true,
        wagmi: config as any,
        customButtons: [],
      });
    }
  }, [config]);


  const withdrawalSupportedNetworks = [
    ...networks
      .filter((layer) => layer.type === NetworkType.EVM)
      .map((l) => l.internal_name),
    KnownInternalNames.Networks.ZksyncMainnet,
  ]
  const autofillSupportedNetworks = [
    // ...withdrawalSupportedNetworks,
    KnownInternalNames.Networks.ImmutableXMainnet,
    KnownInternalNames.Networks.ImmutableXGoerli,
    KnownInternalNames.Networks.BrineMainnet,
    KnownInternalNames.Networks.LoopringGoerli,
    KnownInternalNames.Networks.LoopringMainnet,
  ];

  const openConnectModal = () => {rabbyKitRef.current?.open()}

  const getWallet = () => {
    if (account && account.address && account.connector) {
      return {
        address: account.address,
        connector: account.connector?.id,
        providerName: name,
        icon: ResolveEVMWalletIcon({ connector: account.connector }),
      }
    }
  }

  return {
    getConnectedWallet: getWallet,
    connectWallet: openConnectModal,
    disconnectWallet: disconnect,
    autofillSupportedNetworks,
    withdrawalSupportedNetworks,
    name,
  }
}
