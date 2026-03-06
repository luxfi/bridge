import { Contract, formatEther, JsonRpcProvider, parseEther, parseUnits, Wallet } from "ethers"
import { TransactionType, swapStatusByIndex, SwapStatus, utilaTransactionStatusByIndex } from "@luxfi/core"

import { UTILA_NETWORKS } from "@/domain/constants"
import ERC20B_ABI from "@/domain/constants/ERC20B.json"
import { prisma } from "@/prisma-instance"
import { isValidAddress } from "@/util"

import { getTokenPrice } from "./tokens"
import { isExitFromLux, BRIDGE_FEE_RATE } from "./quote"
import { createMPCWalletForDeposit, checkNativeDeposit, archiveMPCWallet, NETWORK_ASSET_MAP } from "./mpc-wallet"
import { isMPCSigningEnabled, mpcBridgeMint, mpcSendNative } from "./mpc-signer"

export interface SwapData {
  amount: number
  source_network: any
  source_exchange?: string
  source_asset: string
  source_address: string
  destination_network: string
  destination_exchange?: string
  destination_asset: string
  destination_address: string
  refuel: boolean
  use_deposit_address: boolean
  deposit_address?: string
  use_teleporter: boolean
  [property: string]: any
}
/* TODO
export type UpdateSwapData = {
  confirmations: number
  max_confirmations: number
  amount: string | number
  form: string
  to: string
  id: string
  add_output_tx: string
  add_input_tx: string
  // [property: string]: any;
}
*/
/**
 * Create swap according to users' input
 * @param data SwapData
 * @returns swap result
 */
export async function handleSwapCreation(data: SwapData) {
  const { amount, source_network, source_exchange, source_asset, source_address, destination_network, destination_exchange, destination_asset, destination_address, refuel, use_deposit_address, use_teleporter } = data

  try {
    // source network
    const sourceNetwork = await prisma.network.findUnique({
      where: {
        internal_name: source_network
      }
    })

    // source currency
    const sourceCurrency = await prisma.currency.findFirst({
      where: {
        network_id: sourceNetwork?.id,
        asset: source_asset
      }
    })
    // destination network
    const destinationNetwork = await prisma.network.findUnique({
      where: {
        internal_name: destination_network
      }
    })
    // destination currency
    const destinationCurrency = await prisma.currency.findFirst({
      where: {
        network_id: destinationNetwork?.id,
        asset: destination_asset
      }
    })

    let deposit_address = ""
    if (use_deposit_address) {
      // Native MPC wallet — replaces Utila
      const wallet = await createMPCWalletForDeposit(source_network)
      deposit_address = `${wallet.name}###${wallet.addresses[0].address}`
    }

    const swap = await prisma.swap.create({
      data: {
        requested_amount: amount,
        source_network_id: Number(sourceNetwork?.id),
        source_asset_id: Number(sourceCurrency?.id),
        source_exchange,
        source_address,
        destination_network_id: Number(destinationNetwork?.id),
        destination_asset_id: Number(destinationCurrency?.id),
        destination_exchange,
        destination_address,
        refuel,
        use_deposit_address,
        deposit_address,
        use_teleporter,
        status: use_teleporter ? SwapStatus.UserTransferPending : SwapStatus.UserDepositPending,
        quotes: {}
      }
    })

    // native currency for fee pay
    const nativeCurrency = await prisma.currency.findFirst({
      where: {
        network_id: sourceNetwork?.id,
        is_native: true
      }
    })

    // estimate swap rate — 1% fee only on exits from Lux/Zoo
    const [sourcePrice, destinationPrice] = await Promise.all([getTokenPrice(source_asset), getTokenPrice(destination_asset)])
    const raw_receive_amount = Number(amount) * sourcePrice / destinationPrice
    const feeRate = isExitFromLux(source_network, destination_network) ? BRIDGE_FEE_RATE : 0
    const service_fee_amount = raw_receive_amount * feeRate
    const receive_amount = raw_receive_amount - service_fee_amount
    const service_fee_usd = service_fee_amount * destinationPrice

    // save quote
    const quote = await prisma.quote.create({
      data: {
        swap_id: swap.id,
        receive_amount: isNaN(receive_amount) ? 0 : receive_amount,
        min_receive_amount: isNaN(receive_amount) ? 0 : receive_amount * (1 - 0.025),
        blockchain_fee: 0,
        service_fee: feeRate,
        avg_completion_time: "00:03:00",
        slippage: 0.025,
        total_fee: isNaN(service_fee_amount) ? 0 : service_fee_amount,
        total_fee_in_usd: isNaN(service_fee_usd) ? 0 : service_fee_usd
      }
    })

    const result = {
      swap_id: swap.id,
      swap: {
        ...swap,
        source_network,
        source_asset,
        destination_network,
        destination_asset,
        deposit_address
      },
      quote: { ...quote },
      refuel: null,
      reward: null
    }
    return result
  } catch (error: any) {
    //catchPrismaKnowError(error)
    throw new Error(`Error creating swap and related entities: ${String(error)}`)
  }
}

export async function handleUpdateSwapTransactionByID(swapId: string, tokenId: number, networkId: number, type: TransactionType) {
  // Transaction
  await prisma.transaction.create({
    data: {
      status: "completed",
      type: type,
      from: "",
      to: "",
      transaction_hash: "",

      confirmations: 2,
      max_confirmations: 2,
      amount: 2,
      swap: {
        connect: {
          id: swapId
        }
      },
      currency: {
        connect: {
          id: tokenId
        }
      },
      network: {
        connect: {
          id: networkId
        }
      }
    }
  })
}

export async function handlerGetSwap(id: string) {
  try {
    const swap = await prisma.swap.findUnique({
      where: { id },
      include: {
        source_network: true,
        source_asset: true,
        destination_network: true,
        destination_asset: true,
        deposit_actions: true,
        quotes: true,
        transactions: {
          include: {
            currency: true,
            network: {
              include: { currencies: false }
            }
          }
        }
      }
    })

    return {
      ...swap,
      source_network: swap?.source_network?.internal_name,
      source_asset: swap?.source_asset?.asset,
      destination_network: swap?.destination_network?.internal_name,
      destination_asset: swap?.destination_asset?.asset
    }
  } catch (error: any) {
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}

export async function handlerUpdateUserTransferAction(id: string, txHash: string, amount: number, from: string, to: string) {
  try {
    let swap = await prisma.swap.findUnique({
      where: { id }
    })

    const transaction = await prisma.transaction.create({
      data: {
        type: TransactionType.Input,
        status: "user_transfer",
        from: from,
        to: to,
        amount: amount,
        transaction_hash: txHash,
        confirmations: 2,
        max_confirmations: 2,
        swap: {
          connect: {
            id: id
          }
        },
        network: {
          connect: {
            id: swap?.source_network_id
          }
        },
        currency: {
          connect: {
            id: swap?.source_asset_id
          }
        }
      }
    })
    await prisma.swap.update({
      where: { id },
      data: {
        status: SwapStatus.TeleportProcessPending,
        transactions: {
          connect: {
            id: transaction.id // Connect the new transaction to the swap
          }
        }
      }
    })
    swap = await prisma.swap.findUnique({
      where: { id },
      include: {
        source_network: true,
        source_asset: true,
        destination_network: true,
        destination_asset: true,
        deposit_actions: true,
        quotes: true,
        transactions: {
          include: {
            currency: true,
            network: {
              include: { currencies: false }
            }
          }
        }
      }
    })
    return {
      ...swap
    }
  } catch (error: any) {
    console.log(error)
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}
/**
 *
 * @param id ]
 * @param txHash
 * @param amount
 * @param from
 * @param to
 * @returns
 */
export async function handlerUpdatePayoutAction(id: string, txHash: string, amount: number, from: string, to: string) {
  try {
    let swap = await prisma.swap.findUnique({
      where: { id }
    })
    const transaction = await prisma.transaction.create({
      data: {
        status: "payout",
        type: TransactionType.Output,
        from: from,
        to: to,
        amount: amount,
        transaction_hash: txHash,
        confirmations: 2,
        max_confirmations: 2,
        swap: {
          connect: {
            id: id
          }
        },
        network: {
          connect: {
            id: swap?.destination_network_id
          }
        },
        currency: {
          connect: {
            id: swap?.destination_asset_id
          }
        }
      }
    })
    await prisma.swap.update({
      where: { id },
      data: {
        status: SwapStatus.PayoutSuccess,
        transactions: {
          connect: {
            id: transaction.id // Connect the new transaction to the swap
          }
        }
      }
    })
    swap = await prisma.swap.findUnique({
      where: { id },
      include: {
        source_network: true,
        source_asset: true,
        destination_network: true,
        destination_asset: true,
        deposit_actions: true,
        quotes: true,
        transactions: {
          include: {
            currency: true,
            network: {
              include: { currencies: false }
            }
          }
        }
      }
    })
    return {
      ...swap
    }
  } catch (error: any) {
    console.log(error)
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}

/**
 * 
 * @param param0 
 * @returns 
 */
export async function checkDepositAction({
  asset,
  wallet,
  requestedAmount,
  networkInternalName,
}: {
  asset: string,
  wallet: string,
  requestedAmount: number,
  networkInternalName?: string | null,
}) {
  try {
    // Extract address from wallet###address format
    const address = wallet.includes('###') ? wallet.split('###')[1] : wallet

    // If we have the network name, use native deposit check
    if (networkInternalName) {
      return await checkNativeDeposit({
        networkInternalName,
        address,
        asset,
        requiredAmount: requestedAmount,
      })
    }

    // Fallback: try all known networks for this asset
    for (const [network, assets] of Object.entries(NETWORK_ASSET_MAP)) {
      if (assets[asset]) {
        const result = await checkNativeDeposit({
          networkInternalName: network,
          address,
          asset,
          requiredAmount: requestedAmount,
        })
        if (result) return true
      }
    }
    return false
  } catch (err: any) {
    console.error(">> Error while checking Deposit Action", err?.message)
    return false
  }
}
/**
 *
 * @param state
 * @param hash
 * @param amount
 * @param asset
 * @param sourceAddress
 * @param destinationAddress
 * @returns
 */
export async function handlerDepositAction(
  state: number,
  hash: string,
  amount: number,
  asset: string,
  sourceAddress: string | undefined,
  destinationAddress: string,
  created: Date,
  vault: string,
  type: string
) {
  console.log({
    asset,
    sourceAddress,
    destinationAddress,
    amount,
    hash,
    status: utilaTransactionStatusByIndex[state],
    created,
    type
  })
  const swap = await prisma.swap.findFirst({
    where: {
      deposit_address: {
        endsWith: destinationAddress
      }
    },
    include: {
      deposit_actions: true,
      source_network: true,
      source_asset: true
    }
  })

  if (!swap) {
    throw new Error("There is No swap for this transaction")
  }
  // check if action already exists
  const depositActions = swap.deposit_actions
  const _depositAction = depositActions.find((d: any) => d.transaction_hash === hash)
  // Check network and asset match using native mapping
  const networkName = swap.source_network.internal_name as string
  const assetMap = NETWORK_ASSET_MAP[networkName] || UTILA_NETWORKS[networkName]?.assets || {}
  const _wallet = swap.deposit_address?.split('###')?.[0] as string
  const _asset = assetMap[swap.source_asset.asset as string] || swap.source_asset.asset
  if (!_asset) {
    throw new Error(`Unrecognized asset ${swap.source_asset.asset} on ${networkName}`)
  }
  // if deposit action exists, update it else create new one
  if (_depositAction) {
    await prisma.depositAction.updateMany({
      where: {
        transaction_hash: hash
      },
      data: {
        status: utilaTransactionStatusByIndex[state],
        confirmations: state === 13 ? 10 : 0,
        max_confirmations: 10,
        created_date: created
      }
    })
    console.log(`>> Successfully Updated Deposit Action for Swap [${swap.id}]`)
  } else {
    await prisma.depositAction.create({
      data: {
        status: utilaTransactionStatusByIndex[state],
        from: sourceAddress ?? 'unknown sender...',
        to: destinationAddress,
        amount: amount,
        transaction_hash: hash,
        confirmations: state === 13 ? 10 : 0,
        max_confirmations: 10,
        created_date: created,
        swap: {
          connect: {
            id: swap.id
          }
        },
        network: {
          connect: {
            id: swap?.source_network_id
          }
        },
        currency: {
          connect: {
            id: swap?.destination_network_id
          }
        }
      }
    })
  }
  // if confirmed, check whether deposit is
  if (state === 13) { // if confirmed, check if deposit completed
    const confirmed = await checkDepositAction({
      asset: _asset,
      wallet: _wallet,
      requestedAmount: Number(swap.requested_amount),
      networkInternalName: swap.source_network.internal_name,
    })

    if (confirmed) {
      await prisma.swap.update({
        where: { id: swap.id },
        data: {
          status: SwapStatus.BridgeTransferPending
        }
      })
      console.log(`>> Deposit Completed for swap [${swap.id}]`)
    }
  }
  console.log(`>> Successfully Created Deposit Action for Swap [${swap.id}]`)
}
/**
 * 
 * @param swapId 
 */
export async function handlerCheckDeposit(
  swapId: string
) {
  const swap = await prisma.swap.findUnique({
    where: {
      id: swapId
    },
    include: {
      deposit_actions: true,
      source_network: true,
      source_asset: true
    }
  })

  if (!swap) {
    throw new Error("There is No swap for this transaction")
  }
  const networkName = swap.source_network.internal_name as string
  const assetMap = NETWORK_ASSET_MAP[networkName] || UTILA_NETWORKS[networkName]?.assets || {}
  const _wallet = swap.deposit_address?.split('###')?.[0] as string
  const _asset = assetMap[swap.source_asset.asset as string] || swap.source_asset.asset

  const unconfirmedActions = swap.deposit_actions.filter((d: any) => d.status !== 'CONFIRMED')
  if (unconfirmedActions.length > 0) {
    throw new Error(`Some transactions still not confirmed yet`)
  }
  // if confirmed, check whether deposit is
  const confirmed = await checkDepositAction({
    asset: _asset,
    wallet: _wallet,
    requestedAmount: Number(swap.requested_amount)
  })

  if (confirmed) {
    await prisma.swap.update({
      where: { id: swap.id },
      data: {
        status: SwapStatus.BridgeTransferPending
      }
    })
    console.log(`>> Deposit Completed for swap [${swap.id}]`)
  } else {
    throw new Error(`Deposit is not confirmed yet for this swap`)
  }
}
/**
 * handler after deposit is checked
 */
export async function handlerUtilaPayoutAction(swapId: string) {
  const swap = await prisma.swap.findUnique({
    where: {
      id: swapId
    },
    include: {
      source_network: true,
      source_asset: true,
      destination_network: {
        include: { currencies: false }
      },
      destination_asset: true,
      quotes: true
    }
  })
  if (!swap) {
    throw new Error("No swap found for this id")
  }

  // Native MPC wallet and asset
  const networkName = swap.source_network.internal_name as string
  const assetMap = NETWORK_ASSET_MAP[networkName] || UTILA_NETWORKS[networkName]?.assets || {}
  const _wallet = swap?.deposit_address?.split('###')?.[0] as string
  const _asset = assetMap[swap.source_asset.asset as string] || swap.source_asset.asset
  // if already minted, reject
  if (swap.status !== SwapStatus.BridgeTransferPending) {
    throw new Error("Deposit is not completed or Already minted payout token for this swap")
  }
  // check if deposit is completed
  const confirmed = await checkDepositAction({
    asset: _asset,
    wallet: _wallet,
    requestedAmount: Number(swap.requested_amount)
  })

  if (confirmed) {
    const feeCollector = process.env.BRIDGE_FEE_COLLECTOR || '0x0000000000000000000000000000000000000000'

    // 1% fee only on exits from Lux/Zoo; entries are free
    const isExitSwap = isExitFromLux(swap.source_network.internal_name || '', swap.destination_network?.internal_name || '')
    const payoutAmount = isExitSwap
      ? (swap.quotes?.receive_amount ?? (swap.requested_amount * (1 - BRIDGE_FEE_RATE)))
      : swap.requested_amount
    const feeAmount = isExitSwap ? (swap.requested_amount - payoutAmount) : 0

    // rpc urls
    const rpcs: Record<string, string> = {
      'LUX_MAINNET': 'https://api.lux.network',
      'LUX_TESTNET': 'https://api.lux-test.network',
      'ZOO_MAINNET': 'https://api.zoo.network',
      'ZOO_TESTNET': 'https://api.zoo-test.network'
    }
    const rpc = rpcs[swap?.destination_network?.internal_name as string]
    console.log(">> payout details", {
      rpc,
      token: swap.destination_asset.contract_address,
      payoutAmount,
      feeAmount,
      feeCollector,
      mpcEnabled: isMPCSigningEnabled()
    })
    if (!rpc) {
      throw new Error(`No RPC found for chain ${swap?.destination_network?.internal_name}`)
    }
    const provider = new JsonRpcProvider(rpc)
    const decimals = swap?.destination_asset.decimals ?? 18
    const tokenAddress = swap.destination_asset.contract_address as string
    const mintAmount = parseUnits(payoutAmount.toFixed(decimals), decimals)
    const feeAmountWei = feeAmount > 0 ? parseUnits(feeAmount.toFixed(decimals), decimals) : 0n
    const useMPC = isMPCSigningEnabled()

    let signerAddress: string
    let mintTxHash: string

    try {
      console.log(`>> Minting PayoutToken for this Swap [${swap.id}] (MPC: ${useMPC})`)

      if (useMPC) {
        // MPC-signed payout
        mintTxHash = await mpcBridgeMint(provider, tokenAddress, swap.destination_address, mintAmount, ERC20B_ABI)
        signerAddress = process.env.MPC_WALLET_ID || 'mpc'
        console.log(`>> Minted L/Z tokens via MPC ${mintTxHash}`)

        // Mint fee to fee collector via MPC
        if (feeAmountWei > 0n && feeCollector !== '0x0000000000000000000000000000000000000000') {
          try {
            const feeTxHash = await mpcBridgeMint(provider, tokenAddress, feeCollector, feeAmountWei, ERC20B_ABI)
            console.log(`>> Collected ${feeAmount} fee to ${feeCollector} via MPC (${feeTxHash})`)
          } catch (feeErr) {
            console.log(">> Fee collection failed (payout still succeeded):", feeErr)
          }
        }
      } else {
        // Legacy private key signer
        const privateKey = process.env.LUX_SIGNER
        const wallet = new Wallet(privateKey!, provider)
        signerAddress = wallet.address

        const contract = new Contract(tokenAddress, ERC20B_ABI, wallet)
        const txMint = await contract.bridgeMint(swap.destination_address, mintAmount)
        await txMint.wait()
        mintTxHash = txMint.hash
        console.log(`>> Minted L/Z tokens ${mintTxHash}`)

        // Mint fee to fee collector
        if (feeAmountWei > 0n && feeCollector !== '0x0000000000000000000000000000000000000000') {
          try {
            const txFee = await contract.bridgeMint(feeCollector, feeAmountWei)
            await txFee.wait()
            console.log(`>> Collected ${feeAmount} fee to ${feeCollector} (${txFee.hash})`)
          } catch (feeErr) {
            console.log(">> Fee collection failed (payout still succeeded):", feeErr)
          }
        }
      }

      await prisma.transaction.create({
        data: {
          status: "payout",
          type: TransactionType.Output,
          from: signerAddress,
          to: swap.destination_address,
          amount: payoutAmount,
          transaction_hash: mintTxHash,
          confirmations: 2,
          max_confirmations: 2,
          swap: {
            connect: {
              id: swap.id
            }
          },
          network: {
            connect: {
              id: swap?.destination_network_id
            }
          },
          currency: {
            connect: {
              id: swap?.destination_asset_id
            }
          }
        }
      })
      await prisma.swap.update({
        where: { id: swap.id },
        data: {
          status: SwapStatus.PayoutSuccess
        }
      })
    } catch (err) {
      console.log(">> Error while minting Z/L tokens", err)
      throw new Error("Error while minting Z/L tokens")
    }

    // Refuel: send 1 native token if balance < 1
    try {
      const _balance = await provider.getBalance(swap.destination_address)
      console.log(">> Lux or Zoo balance:", Number(formatEther(_balance)));
      if (Number(formatEther(_balance)) < 1) {
        console.log(">> Sending 1 L/Z token");
        if (useMPC) {
          const refuelHash = await mpcSendNative(provider, swap.destination_address, parseEther('1'))
          console.log(`>> 1 Zoo or Lux sent via MPC to ${swap.destination_address} (${refuelHash})`)
        } else {
          const privateKey = process.env.LUX_SIGNER
          const wallet = new Wallet(privateKey!, provider)
          const feeData = await provider.getFeeData()
          const _txSendLux = await wallet.sendTransaction({
            to: swap.destination_address,
            value: parseEther('1'),
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            gasLimit: 3000000,
          })
          await _txSendLux.wait()
          console.log(`>> 1 Zoo or Lux is sent to ${swap.destination_address}`)
        }
      }
    } catch (err) {
      console.log(">> Error while sending 1 Z/L tokens", err)
    }

    return {
      status: 'success',
      msg: 'Z/L tokens have been minted successfully'
    }
  } else {
    // if deposit is not completed, set status as UserTransferPending
    await prisma.swap.update({
      where: { id: swap.id },
      data: {
        status: SwapStatus.UserTransferPending
      }
    })
    return {
      status: 'ex',
      msg: 'deposit not completed yet'
    }
  }
}
/**
 * make swap expire if there is no deposit for 72h
 * @param id
 * @returns
 */
export async function handlerSwapExpire(id: string) {
  try {
    const swap = await prisma.swap.findUnique({
      where: { id }
    })
    if (!swap) throw { message: "No swap found for swapId" }
    const wallet = swap.deposit_address?.split("#")?.[0]
    archiveMPCWallet(wallet as string)
    await prisma.swap.update({
      where: { id },
      data: {
        status: SwapStatus.Expired
      }
    })
  } catch (error: any) {
    console.log(error)
    //catchPrismaKnowError(error)
    throw new Error(`Error Getting Swap: ${error?.message}`)
  }
}
/**
 * 
 * @param id 
 * @param txHash 
 * @param amount 
 * @param from 
 * @param to 
 * @returns 
 */
export async function handlerUpdateMpcSignAction(id: string, txHash: string, amount: number, from: string, to: string) {
  try {
    let swap = await prisma.swap.findUnique({
      where: { id }
    })
    const transaction = await prisma.transaction.create({
      data: {
        status: "mpc_sign",
        type: TransactionType.Input,
        from: from,
        to: to,
        amount: amount,
        transaction_hash: txHash,
        confirmations: 2,
        max_confirmations: 2,
        swap: {
          connect: {
            id: id
          }
        },
        network: {
          connect: {
            id: swap?.source_network_id
          }
        },
        currency: {
          connect: {
            id: swap?.source_asset_id
          }
        }
      }
    })
    await prisma.swap.update({
      where: { id },
      data: {
        status: "user_payout_pending",
        transactions: {
          connect: {
            id: transaction.id // Connect the new transaction to the swap
          }
        }
      }
    })
    swap = await prisma.swap.findUnique({
      where: { id },
      include: {
        source_network: true,
        source_asset: true,
        destination_network: true,
        destination_asset: true,
        deposit_actions: true,
        quotes: true,
        transactions: {
          include: {
            currency: true,
            network: {
              include: { currencies: false }
            }
          }
        }
      }
    })
    return {
      ...swap
    }
  } catch (error: any) {
    console.log(error)
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}
/**
 * 
 * @param address 
 * @param isDeleted 
 * @param isMainnet 
 * @returns 
 */
export async function handlerGetSwaps(isDeleted?: boolean, isMainnet?: boolean, isTeleport?: boolean, page?: number, pageSize: number = 20) {
  try {
    if (page) {
      const swaps = await prisma.swap.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          created_date: "desc"
        },
        where: {
          use_teleporter: isTeleport,
          source_network: {
            is_testnet: !isMainnet, // Add the condition for source_network's istestnet field
          }
        },
        include: {
          source_network: true,
          source_asset: true,
          destination_network: true,
          destination_asset: true,
          deposit_actions: true,
          quotes: true,
          transactions: {
            include: {
              currency: true,
              network: {
                include: { currencies: false }
              }
            }
          }
        }
      })

      return swaps.map((s: any) => ({
        ...s,
        source_network: s?.source_network?.internal_name,
        source_asset: s?.source_asset?.asset,
        destination_network: s?.destination_network?.internal_name,
        destination_asset: s?.destination_asset?.asset
      }))
    } else {
      const swaps = await prisma.swap.findMany({
        orderBy: {
          created_date: "desc"
        },
        where: {
          use_teleporter: isTeleport,
          source_network: {
            is_testnet: !isMainnet, // Add the condition for source_network's istestnet field
          }
        },
        include: {
          source_network: true,
          source_asset: true,
          destination_network: true,
          destination_asset: true,
          deposit_actions: true,
          quotes: true,
          transactions: {
            include: {
              currency: true,
              network: {
                include: { currencies: false }
              }
            }
          }
        }
      })

      return swaps.map((s: any) => ({
        ...s,
        source_network: s?.source_network?.internal_name,
        source_asset: s?.source_asset?.asset,
        destination_network: s?.destination_network?.internal_name,
        destination_asset: s?.destination_asset?.asset
      }))
    }

  } catch (error: any) {
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}
/**
 * 
 * @param address 
 * @returns 
 */
export async function handlerGetSwapsByAddress(address: string) {
  try {
    const swaps = await prisma.swap.findMany({
      orderBy: {
        created_date: "desc"
      },
      where: {
        source_address: address
      },
      include: {
        source_network: true,
        source_asset: true,
        destination_network: true,
        destination_asset: true,
        deposit_actions: true,
        quotes: true,
        transactions: {
          include: {
            currency: true,
            network: {
              include: { currencies: false }
            }
          }
        }
      }
    })
    return swaps.map((s: any) => ({
      ...s,
      source_network: s?.source_network?.internal_name,
      source_asset: s?.source_asset?.asset,
      destination_network: s?.destination_network?.internal_name,
      destination_asset: s?.destination_asset?.asset
    }))
  } catch (error: any) {
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}
/**
 * 
 * @param address 
 * @returns 
 */
export async function handlerGetHasBySwaps(address: string) {
  try {
    const isadd = isValidAddress(address)
    if (isadd) {
      return await handlerGetSwapsByAddress(address)
    } else {
      console.time()
      const transaction = await prisma.transaction.findFirstOrThrow({
        where: { transaction_hash: address },
        select: {
          swap: {
            include: {
              transactions: {
                include: {
                  currency: true,
                  network: {
                    include: {
                      currencies: true
                    }
                  }
                }
              }
            }
          }
        }
      })
      return [{ ...transaction.swap }]
    }
  } catch (error: any) {
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}

export async function handlerGetExplorer(status: string[]) {
  console.time()
  const statuses = status.map((numberStr: string) => swapStatusByIndex[Number(numberStr)])
  console.log("🚀 ~ handlerGetExplorer ~ statuses:", statuses)

  try {
    const swaps = await prisma.swap.findMany({
      orderBy: {
        created_date: "desc"
      },
      where: {
        status: {
          in: statuses
        }
      },
      include: {
        source_network: true,
        source_asset: true,
        destination_network: true,
        destination_asset: true,
        deposit_actions: true,
        quotes: true,
        transactions: {
          include: {
            currency: true,
            network: {
              include: { currencies: true }
            }
          }
        }
      }
    })

    console.timeEnd()
    return swaps.map((s: any) => ({
      ...s,
      source_network: s?.source_network?.internal_name,
      source_asset: s?.source_asset?.asset,
      destination_network: s?.destination_network?.internal_name,
      destination_asset: s?.destination_asset?.asset
    }))
  } catch (error: any) {
    //catchPrismaKnowError(error)
    throw new Error(`Error getting swap: ${error?.message}`)
  }
}

export async function handlerDelSwap(swapData: { id: string }) {
  try {
    await prisma.swap.update({
      where: { id: swapData.id },
      data: { ...swapData }
    })
    return "success"
  } catch (error: any) {
    //catchPrismaKnowError(error)
    throw new Error(`Error deleting swaps: ${error?.message}`)
  }
}

// function catchPrismaKnowError(error: Error) {
//   if (error instanceof Prisma.PrismaClientKnownRequestError) {
//     throw new Error(`Error getting Prisma code: ${error.name} msg:${error?.message}`)
//   }
// }
