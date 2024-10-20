import KnownInternalNames from "../../knownIds";
import formatAmount from "../../formatAmount";
import type { Balance, BalanceProps, BalanceProvider, Gas, GasProps } from "../../../Models/Balance";

type Balances = {
    [currency: string]: string;
};

type CommitedObject = {
    committed: {
        balances: Balances;
        nonce: number;
        pubKeyHash: string;
    };
};

type zkSyncGas = {
    feeType: string,
    gasFee: string,
    gasPriceWei: string,
    gasTxAmount: string,
    totalFee: string,
    zkpFee: string
}

export default function useZkSyncBalance(): BalanceProvider {
    const name = 'zksync_lite'
    const supportedNetworks = [
        KnownInternalNames.Networks.ZksyncMainnet
    ]

    const getBalance = async ({ layer, address }: BalanceProps) => {

        let balances: Balance[] = []

        if (!layer.assets) return

        const { createPublicClient, http } = await import('viem');
        const provider = createPublicClient({
            transport: http(`${layer.nodes[0].url}jsrpc`)
        })

        try {
            const result: CommitedObject = await provider.request({ method: 'account_info' as any, params: [address as `0x${string}`] });

            const zkSyncBalances = layer.assets.map((a) => {
                const currency = layer?.assets?.find(c => c?.asset == a.asset);
                const amount = currency && result.committed.balances[currency.asset];

                return ({
                    network: layer.internal_name,
                    token: a.asset,
                    amount: formatAmount(amount, Number(currency?.decimals)),
                    request_time: new Date().toJSON(),
                    decimals: Number(currency?.decimals),
                    isNativeCurrency: false
                })
            });

            balances = [
                ...zkSyncBalances,
            ]
        }
        catch( e: any ) {
            console.log(e)
        }

        return balances
    }

    const getGas = async ({ layer, currency, address }: GasProps) => {

        let gas: Gas[] = [];
        if (!layer.assets) return

        const { createPublicClient, http } = await import('viem');
        const provider = createPublicClient({
            transport: http(`${layer.nodes[0].url}jsrpc`)
        })

        try {
            const result: zkSyncGas = await provider.request({ method: 'get_tx_fee' as any, params: ["Transfer" as any, address as `0x${string}`, currency.asset as any] })
            const currencyDec = layer?.assets?.find(c => c?.asset == currency.asset)?.decimals;
            const formatedGas = formatAmount(result.totalFee, Number(currencyDec))

            gas = [{
                token: currency.asset,
                gas: formatedGas,
                request_time: new Date().toJSON()
            }]
        }
        catch( e: any ) {
            console.log(e)
        }

        return gas
    }

    return {
        getBalance,
        getGas,
        name,
        supportedNetworks
    }
}