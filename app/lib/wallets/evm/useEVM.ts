import { useConnectModal } from "@rainbow-me/rainbowkit"
import { useDisconnect } from 'wagmi';
import { useAccount } from "wagmi"
import { NetworkType } from "../../../Models/CryptoNetwork"
import { useSettingsState } from "../../../context/settings"
import { WalletProvider } from "../../../hooks/useWallet"
import KnownInternalNames from "../../knownIds"
import { ResolveEVMWalletIcon } from "./resolveEVMIcon"

export default function useEVM(): WalletProvider {

    const { disconnect } = useDisconnect();

    const { layers } = useSettingsState();
    const withdrawalSupportedNetworks = [
        ...layers.filter(layer => layer.type === NetworkType.EVM).map(l => l.internal_name),
        KnownInternalNames.Networks.ZksyncMainnet
    ]
    const autofillSupportedNetworks = [
        ...withdrawalSupportedNetworks,
        KnownInternalNames.Networks.ImmutableXMainnet,
        KnownInternalNames.Networks.ImmutableXGoerli,
        KnownInternalNames.Networks.BrineMainnet,
        KnownInternalNames.Networks.LoopringGoerli,
        KnownInternalNames.Networks.LoopringMainnet
    ]
    const name = 'evm'
    const account = useAccount()
    const { openConnectModal } = useConnectModal()

    const getWallet = () => {
        if (account && account.address && account.connector) {
            return {
                address: account.address,
                connector: account.connector?.id,
                providerName: name,
                icon: ResolveEVMWalletIcon({ connector: account.connector })
            }
        }
    }

    const connectWallet = () => {
        return openConnectModal && openConnectModal()
    }

    return {
        getConnectedWallet: getWallet,
        connectWallet,
        disconnectWallet: disconnect,
        autofillSupportedNetworks,
        withdrawalSupportedNetworks,
        name
    }
}