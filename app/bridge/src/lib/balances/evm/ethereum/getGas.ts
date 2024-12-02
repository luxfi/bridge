import { type PublicClient, formatGwei } from "viem";
import formatAmount from "../../../formatAmount";
import getEVMGas from "../gas";
import { type Gas } from "../../../../Models/Balance";
import type { CryptoNetwork, NetworkCurrency } from "@/Models/CryptoNetwork"

export default class getEthereumGas extends getEVMGas {

    constructor(
      publicClient: PublicClient,
      chainId: number,
      contract_address: string,
      account: string,
      from: CryptoNetwork,
      currency: NetworkCurrency,
      destination: string,
      nativeToken: NetworkCurrency,
      isSweeplessTx: boolean
    ) {
      super(
        publicClient,
        chainId,
        contract_address as `0x${string}`,
        account as `0x${string}`,
        from,
        currency,
        destination as `0x${string}`,
        nativeToken,
        isSweeplessTx,

      )
    }

    resolveGas = async (): Promise<Gas | undefined> => {
        const feeData = await this.resolveFeeData()

        const estimatedGasLimit = this.contract_address ?
            await this.estimateERC20GasLimit()
            : await this.estimateNativeGasLimit()

        const multiplier = feeData.maxFeePerGas || feeData.gasPrice

        if (!multiplier)
            return undefined

        const totalGas = multiplier * estimatedGasLimit

        const formattedGas = formatAmount(totalGas, this.nativeToken?.decimals)
        return {
            gas: formattedGas,
            token: this.currency?.asset,
            gasDetails: {
                gasLimit: Number(estimatedGasLimit),
                maxFeePerGas: feeData?.maxFeePerGas ? Number(formatGwei(feeData?.maxFeePerGas)) : undefined,
                gasPrice: feeData?.gasPrice ? Number(formatGwei(feeData?.gasPrice)) : undefined,
                maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas ? Number(formatGwei(feeData?.maxPriorityFeePerGas)) : undefined,
            },
            request_time: new Date().toJSON()
        }
    }

}