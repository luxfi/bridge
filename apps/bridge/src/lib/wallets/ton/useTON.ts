/*
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { Address } from "@ton/core"
import KnownInternalNames from "../../knownIds"
import { type Wallet } from "@/stores/walletStore"
import { type WalletProvider } from "@/hooks/useWallet"
import TON from "@/components/icons/Wallets/TON"

function useTON(): WalletProvider {
    const withdrawalSupportedNetworks = [KnownInternalNames.Networks.TONMainnet]
    const autofillSupportedNetworks = withdrawalSupportedNetworks
    const name = 'ton'
    const wallet = useTonWallet()
    const [tonConnectUI] = useTonConnectUI()

    const getWallet = () => {
        if (wallet) {
            const w: Wallet = {
                address: Address.parse(wallet.account.address).toString({ bounceable: false }),
                connector: name,
                providerName: name,
                icon: TON
            }
            return w
        }
    }

    const connectWallet = () => {
        return tonConnectUI.openModal()
    }

    const disconnectWallet = async () => {
        try {
            await tonConnectUI.disconnect()
        }
        catch( e: any ) {
            console.log(e)
        }
    }

    return {
        getConnectedWallet: getWallet,
        connectWallet,
        disconnectWallet,
        autofillSupportedNetworks,
        withdrawalSupportedNetworks,
        name
    }
}

export default useTON
*/