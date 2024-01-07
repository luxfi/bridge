//from https://github.com/ethereum-optimism/optimism/blob/develop/packages/fee-estimation/src/estimateFees.ts

import type {} from "class-variance-authority" // https://github.com/microsoft/TypeScript/issues/47663
import type {} from '@storybook/react'

import {
  gasPriceOracleABI,
  gasPriceOracleAddress,
} from '@eth-optimism/contracts-ts'
import {
  getContract,
  BlockTag,
  PublicClient,
} from 'viem'

/**
 * Options to query a specific block
 */
type BlockOptions = {
  /**
   * Block number to query from
   */
  blockNumber?: bigint
  /**
   * Block tag to query from
   */
  blockTag?: BlockTag
}

/**
 * Get gas price Oracle contract
 */
const getGasPriceOracleContract = (client: PublicClient) => {
  return getContract({
    address: gasPriceOracleAddress['420'],
    abi: gasPriceOracleABI,
    publicClient: client,
  })
}


/**
 * Computes the L1 portion of the fee based on the size of the rlp encoded input
 * transaction, the current L1 base fee, and the various dynamic parameters.
 * @example
 * const L1FeeValue = await getL1Fee(data, params);
 */
export const getL1Fee = async (options: { data: `0x02${string}`, client: PublicClient } & BlockOptions) => {
  const contract = getGasPriceOracleContract(options.client)
  return contract.read.getL1Fee([options.data], {
    blockNumber: options.blockNumber,
    blockTag: options.blockTag,
  })
}
