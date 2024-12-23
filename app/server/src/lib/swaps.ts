import ERC20B_ABI from '@/constants/ERC20B.json'
import { prisma } from "@/lib/prisma"
import { isValidAddress } from "@/lib/utils"
import { statusMapping, SwapStatus, UtilaTransactionStateMapping } from "@/models/SwapStatus"
import { TransactionType } from "@/models/TransactionTypes"
import { getTokenPrice } from "./tokens"
import { archiveWalletForExpire, client, createNewWalletForDeposit } from "./utila"
import { UTILA_NETWORKS } from "@/config/constants"
import { Contract, formatEther, JsonRpcProvider, parseEther, Wallet } from "ethers"

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
      // in the case of using utila mpc wallet
      const wallet = await createNewWalletForDeposit(source_network)
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

    // estimate swap rate
    const [sourcePrice, destinationPrice] = await Promise.all([getTokenPrice(source_asset), getTokenPrice(destination_asset)])
    const receive_amount = (Number(amount) * sourcePrice) / destinationPrice

    // save quote
    const quote = await prisma.quote.create({
      data: {
        swap_id: swap.id,
        receive_amount,
        min_receive_amount: 0,
        blockchain_fee: 0,
        service_fee: 0,
        avg_completion_time: "00:03:00",
        slippage: 0.025,
        total_fee: 0,
        total_fee_in_usd: 0
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
export async function checkDepositAction ({
  asset,
  wallet,
  requestedAmount
}: {
  asset: string,
  wallet: string,
  requestedAmount: number
}) {
  try {
    const { walletBalances } = await client.queryWalletBalances({
      parent: wallet,
      filter: `asset("${asset}")`
    })
    const balance = walletBalances.filter((b: any) => b.asset === asset).reduce((sum: number, b: any) => sum + Number(b.value), 0)
    if (balance >= requestedAmount) { //if deposited amount is lager than needed
      console.log(`>> Deposit for swap [${balance}, ${requestedAmount}]`)
      return true
    } else {
      return false
    }
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
    status: UtilaTransactionStateMapping[state],
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
  // checking Utila network
  const utilaNetwork = UTILA_NETWORKS[swap.source_network.internal_name as string]
  if (!utilaNetwork) {
    throw new Error(`Unrecognized Utila Network [${swap.source_network.internal_name}]`)
  }
  // checking network and asset match
  const _wallet = swap.deposit_address?.split('###')?.[0] as string
  const _asset = utilaNetwork.assets[swap.source_asset.asset as string]
  if (_asset?.toLowerCase() !== asset.toLowerCase()) {
    throw new Error("Unrecognized Token Deposit")
  }
  // if deposit action exists, update it else create new one
  if (_depositAction) {
    await prisma.depositAction.updateMany({
      where: {
        transaction_hash: hash
      },
      data: {
        status: UtilaTransactionStateMapping[state],
        confirmations: state === 13 ? 10 : 0,
        max_confirmations: 10,
        created_date: created
      }
    })
    console.log(`>> Successfully Updated Deposit Action for Swap [${swap.id}]`)
  } else {
    await prisma.depositAction.create({
      data: {
        status: UtilaTransactionStateMapping[state],
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
    const confirmed = await checkDepositAction ({
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
  const utilaNetwork = UTILA_NETWORKS[swap.source_network.internal_name as string]
  if (!utilaNetwork) {
    throw new Error(`Unrecognized Utila Network [${swap.source_network.internal_name}]`)
  }
  // checking network and asset match
  const _wallet = swap.deposit_address?.split('###')?.[0] as string
  const _asset = utilaNetwork.assets[swap.source_asset.asset as string]

  const unconfirmedActions = swap.deposit_actions.filter((d: any) => d.status !== 'CONFIRMED')
  if (unconfirmedActions.length > 0) {
    throw new Error(`Some transactions still not confirmed yet`)
  }
  // if confirmed, check whether deposit is
  const confirmed = await checkDepositAction ({
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
      destination_asset: true
    }
  })
  if (!swap) {
    throw new Error("No swap found for this id")
  }

  // checking Utila network
  const utilaNetwork = UTILA_NETWORKS[swap.source_network.internal_name as string]
  if (!utilaNetwork) {
    throw new Error(`Unrecognized Utila Network [${swap.source_network.internal_name}]`)
  }
  // utila wallet and asset
  const _wallet = swap?.deposit_address?.split('###')?.[0] as string
  const _asset = utilaNetwork.assets[swap.source_asset.asset as string]
  // if already minted, reject
  if (swap.status !== SwapStatus.BridgeTransferPending) {
    throw new Error("Deposit is not completed or Already minted payout token for this swap")
  }
  // check if deposit is completed
  const confirmed = await checkDepositAction ({
    asset: _asset,
    wallet: _wallet,
    requestedAmount: Number(swap.requested_amount)
  })
  
  if (confirmed) {
    // todo: mint L or Z tokens here 
    // Replace with your private key (store it securely, not hardcoded in production)
    const privateKey = process.env.LUX_SIGNER

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
      amount: swap.requested_amount
    })
    if (!rpc) {
      throw new Error(`No RPC found for chain ${swap?.destination_network?.internal_name}`)
    }
    const provider = new JsonRpcProvider(rpc)
    const feeData = await provider.getFeeData()
    // signer
    const wallet = new Wallet(privateKey!, provider)
    // mint payout token

    try {
      console.log(`>> Minting PayoutToken for this Swap [${swap.id}]`)

      const contract = new Contract(swap.destination_asset.contract_address as string, ERC20B_ABI, wallet)
      const txMint = await contract.bridgeMint(swap.destination_address, parseEther(String(swap.requested_amount)))
      await txMint.wait()
      console.log(`>> Minted L/Z tokens ${txMint.hash}`)

      await prisma.transaction.create({
        data: {
          status: "payout",
          type: TransactionType.Output,
          from: wallet.address,
          to: swap.destination_address,
          amount: swap.requested_amount,
          transaction_hash: txMint.hash,
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

    try {
      const _balance = await provider.getBalance(swap.destination_address)
      console.log(">> Lux or Zoo balance:", Number(formatEther(_balance)));
      if (Number(formatEther(_balance)) < 1) {
        console.log(">> Sending 1 L/Z token");
        const luxSendTxData = {
          to: swap.destination_address,
          value: parseEther('1'), // eth to wei
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          gasLimit: 3000000,
        }
        const _txSendLux = await wallet.sendTransaction(luxSendTxData)
        await _txSendLux.wait()
        console.log(`>> 1 Zoo or Lux is sent to ${swap.destination_address}`)
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
    archiveWalletForExpire(wallet as string)
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
export async function handlerGetSwaps(isDeleted?: boolean, isMainnet? : boolean, isTeleport?: boolean, page?: number, pageSize: number = 20) {
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
  const statuses = status.map((numberStr: string) => statusMapping[Number(numberStr)])
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
