import { type Wallet } from "../stores/walletStore"
import { type CryptoNetwork, type NetworkCurrency } from "./CryptoNetwork"

export type BalanceProps = {
    layer: CryptoNetwork,
    address: string
}

export type GasProps = {
    layer: CryptoNetwork,
    currency: NetworkCurrency,
    address?: `0x${string}`,
    userDestinationAddress?: string,
    wallet?: Wallet
}

export type Balance = {
    network: string,
    amount: number,
    decimals: number,
    isNativeCurrency: boolean,
    token: string,
    request_time: string,
}

export type Gas = {
    token: string,
    gas: number,
    gasDetails?: {
        gasLimit?: number,
        maxFeePerGas?: number,
        gasPrice?: number,
        maxPriorityFeePerGas?: number
    },
    request_time: string
}

export type BalanceProvider = {
    getBalance: ({ layer, address }: BalanceProps) => Promise<Balance[] | undefined> | undefined | void,
    getGas: ({ layer, address, currency, userDestinationAddress, wallet }: GasProps) => Promise<Gas[] | undefined> | undefined | void,
    supportedNetworks: string[],
    name: string,
}