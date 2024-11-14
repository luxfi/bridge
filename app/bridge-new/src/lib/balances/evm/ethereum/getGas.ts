import { type PublicClient, formatGwei } from "viem";
import formatAmount from "../../../formatAmount";
import getEVMGas from "../gas";
import { type Gas } from "../../../../Models/Balance";
import type { NetworkCurrency } from "@/Models/CryptoNetwork"
import type { Layer } from "@/Models/Layer"

export default class getEthereumGas extends getEVMGas {

    constructor(
      publicClient: PublicClient,
      chainId: number,
      contract_address: `0x${string}`,
      account: `0x${string}`,
      from: Layer,
      currency: NetworkCurrency,
      destination: `0x${string}`,
      nativeToken: NetworkCurrency,
      isSweeplessTx: boolean
    ) {
      super(
        publicClient,
        chainId,
        contract_address,
        account,
        from,
        currency,
        destination,
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