import toast from "react-hot-toast";
import BridgeApiClient, { type SwapItem } from "../lib/BridgeApiClient";
import { type Wallet } from "../stores/walletStore";
// import useTON from "../lib/wallets/ton/useTON";
import useEVM from "../lib/wallets/evm/useEVM";
//import useStarknet from "../lib/wallets/starknet/useStarknet";
import useImmutableX from "../lib/wallets/immutableX/useIMX";
import useSolana from "../lib/wallets/solana/useSolana";
import type { CryptoNetwork } from "@/Models/CryptoNetwork";

export type WalletProvider = {
  connectWallet: (
    chain?: string | number | undefined | null
  ) => Promise<void> | undefined | void;
  disconnectWallet: () => Promise<void> | undefined | void;
  getConnectedWallet: () => Wallet | undefined;
  autofillSupportedNetworks?: string[];
  withdrawalSupportedNetworks: string[];
  name: string;
};

function useWallet() {
  const WalletProviders: WalletProvider[] = [
    // useTON(),
    useEVM(),
    //useStarknet(),
    useImmutableX(),
    useSolana(),
  ];

  async function handleConnect(providerName: string, chain?: string | number) {
    const provider = WalletProviders.find(
      (provider) => provider.name === providerName
    );
    try {
      await provider?.connectWallet(chain);
    } catch {
      toast.error("Couldn't connect the account");
    }
  }

  const handleDisconnect = async (providerName: string, swap?: SwapItem) => {
    const provider = WalletProviders.find(
      (provider) => provider.name === providerName
    );
    try {
      if (swap?.source_exchange) {
        const apiClient = new BridgeApiClient();
        await apiClient.DisconnectExchangeAsync(swap.id, "coinbase");
      } else {
        await provider?.disconnectWallet();
      }
    } catch {
      toast.error("Couldn't disconnect the account");
    }
  };

  const getConnectedWallets = () => {
    let connectedWallets: Wallet[] = [];

    WalletProviders.forEach((wallet) => {
      const w = wallet.getConnectedWallet();
      connectedWallets = (w && [...connectedWallets, w]) || [
        ...connectedWallets,
      ];
    });

    return connectedWallets;
  };

  const getWithdrawalProvider = (network: CryptoNetwork) => {
    const provider = WalletProviders.find((provider) =>
      provider.withdrawalSupportedNetworks.includes(network.internal_name)
    );
    return provider;
  };

  const getAutofillProvider = (network: CryptoNetwork) => {
    console.log(WalletProviders)
    const provider = WalletProviders.find((provider) =>
      provider?.autofillSupportedNetworks?.includes(network.internal_name)
    );
    return provider;
  };

  const getAutofillProviderUsingName = (network: string) => {
    console.log(WalletProviders)
    const provider = WalletProviders.find((provider) =>
      provider?.autofillSupportedNetworks?.includes(network)
    );
    return provider;
  };

  return {
    wallets: getConnectedWallets(),
    connectWallet: handleConnect,
    disconnectWallet: handleDisconnect,
    getWithdrawalProvider,
    getAutofillProvider,
    getAutofillProviderUsingName
  };
}

export default useWallet;
