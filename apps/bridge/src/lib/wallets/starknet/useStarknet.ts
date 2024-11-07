import { fromHex } from "viem";
import { type WalletProvider } from "../../../hooks/useWallet";
import { useWalletStore } from "../../../stores/walletStore"
import KnownInternalNames from "../../knownIds"
import { useCallback } from "react";
import { ResolveStarknetWalletIcon } from "./resolveStarknetIcon";

export default function useStarknet(): WalletProvider {
    const withdrawalSupportedNetworks = [KnownInternalNames.Networks.StarkNetMainnet, KnownInternalNames.Networks.StarkNetGoerli]
    const autofillSupportedNetworks = withdrawalSupportedNetworks
    const name = 'starknet'
    const WALLETCONNECT_PROJECT_ID = '28168903b2d30c75e5f7f2d71902581b';
    const wallets = useWalletStore((state) => state.connectedWallets)

    const addWallet = useWalletStore((state) => state.connectWallet)
    const removeWallet = useWalletStore((state) => state.disconnectWallet)

    const getWallet = () => {
        return wallets.find(wallet => wallet.providerName === name)
    }

    const connectWallet = useCallback(async (chain: string) => {
        const constants = (await import('starknet')).constants
        const chainId = (chain && fromHex(chain as `0x${string}`, 'string')) || constants.NetworkName.SN_MAIN
        const connect = (await import('starknetkit')).connect
        try {
            const res = await connect({
                argentMobileOptions: {
                    dappName: 'Bridge',
                    projectId: WALLETCONNECT_PROJECT_ID,
                    url: 'https://bridge.lux.network/app',
                    description: 'Move crypto across exchanges, blockchains, and wallets.',
                    chainId: chainId as any
                },
                dappName: 'Bridge',
            }) as any
            if (res && res.account && res.isConnected) {
                addWallet({
                    address: res.account.address,
                    chainId: res.provider?.chainId || res.provider?.provider?.chainId,
                    icon: ResolveStarknetWalletIcon({ connector: res.name }),
                    connector: res.name,
                    providerName: name,
                    metadata: {
                        starknetAccount: res
                    }
                })
            } else if (res?.isConnected === false) {
                await disconnectWallet()
                connectWallet(chain)
            }
        }
        catch( e: any ) {
            throw new Error(e)
        }
    }, [addWallet])

    const disconnectWallet = async () => {
        const disconnect = (await import('starknetkit')).disconnect
        try {
            disconnect({ clearLastWallet: true })
            removeWallet(name)
        }
        catch( e: any ) {
            console.log(e)
        }
    }

    return {
        getConnectedWallet: getWallet,
        connectWallet: connectWallet as (chain?: string | number | null | undefined) => void | Promise<void> | undefined,
        disconnectWallet,
        autofillSupportedNetworks,
        withdrawalSupportedNetworks,
        name
    }
}