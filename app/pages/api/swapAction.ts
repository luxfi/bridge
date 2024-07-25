import { Prisma } from "@prisma/client";
import { number } from "joi";

import prisma from "../../lib/db";
import { isValidAddress } from "../../lib/addressValidator";
import { statusMapping, SwapStatus } from "../../Models/SwapStatus";
import { TransactionType } from "../../Models/TransactionTypes";

export interface SwapData {
  amount: number;
  source_network: string;
  source_exchange?: string;
  source_asset: string;
  source_address: string;
  destination_network: string;
  destination_exchange?: string;
  destination_asset: string;
  destination_address: string;
  refuel: boolean;
  use_deposit_address: boolean;
  contract_address: {
    contract_name: string;
    contract_address: string;
  };
}

function generateRandomString(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export async function handleUpdateSwapTransactionByID(
  swapId: string,
  tokenId: number,
  networkId: number,
  type: TransactionType
) {
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
          id: swapId,
        },
      },
      token: {
        connect: {
          id: tokenId,
        },
      },
      network: {
        connect: {
          id: networkId,
        },
      },
    },
  });
}

export async function handleSwapCreation(data: SwapData) {
  const {
    amount,
    source_network,
    source_exchange,
    source_asset,
    source_address,
    destination_network,
    destination_exchange,
    destination_asset,
    destination_address,
    refuel,
    use_deposit_address,
    contract_address: cAddress,
  } = data;

  console.log("test================================>", {
    amount,
    source_network,
    source_exchange,
    source_asset,
    source_address,
    destination_network,
    destination_exchange,
    destination_asset,
    destination_address,
    refuel,
    use_deposit_address,
    cAddress,
  });

  try {
    // 首先创建 Token
    const token = await prisma.token.create({
      data: {
        symbol: "ETH",
        logo: "https://prodlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
        contract: "0",
        decimals: 18,
        price_in_usd: 3482.44,
        precision: 8,
        listing_date: new Date("2021-12-21T16:59:11.139Z"),
      },
    });

    // 然后创建 Network
    const network = await prisma.network.create({
      data: {
        name: "ZKSYNC_MAINNET",
        display_name: "zkSync Lite",
        logo: "https://prodlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/zksync_mainnet.png",
        chain_id: "mainnet",
        node_url: "https://api.zksync.io/",
        type: "zksynclite",
        transaction_explorer_template:
          "https://zkscan.io/explorer/transactions/{0}",
        account_explorer_template: "https://zkscan.io/explorer/accounts/{0}",
        listing_date: new Date("2021-12-21T16:59:11.139Z"),
        token: {
          connect: {
            id: token.id,
          },
        },
      },
    });
    const destinationNetworkRecord = network;
    const sourceNetworkRecord = network;
    const destinationTokenRecord = token;

    const sourceTokenRecord = token;

    const swap = await prisma.swap.create({
      data: {
        requested_amount: amount,
        source_network,
        source_exchange,
        source_asset,
        source_address,
        destination_network,
        destination_exchange,
        destination_asset,
        destination_address,
        refuel,
        use_deposit_address,
        status: SwapStatus.UserTransferPending,
        // deposit_actions: {
        //   createMany: {
        //     data: [
        //       {
        //         type: "transfer",
        //         to_address: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
        //         amount,
        //         order_number: 0,
        //         amount_in_base_units: "331000000000000",
        //         network_id: sourceNetworkRecord.id,
        //         token_id: sourceTokenRecord.id,
        //         fee_token_id: destinationTokenRecord.id,
        //         call_data: "0x168b",
        //       },
        //     ],
        //   },
        // },
        quotes: {},
      },
    });

    // Transaction
    // await prisma.transaction.create({
    //   data: {
    //     status: "completed",
    //     type: "input",
    //     from: source_address,
    //     to: cAddress?.contract_address,
    //     transaction_hash: `0x${
    //       generateRandomString() +
    //       "89197d533f13af33cd8dcd799cc0a254911f7aa7d3481daa1550fe" +
    //       generateRandomString()
    //     }`,

    //     confirmations: 2,
    //     max_confirmations: 2,
    //     amount: amount,
    //     swap: {
    //       connect: {
    //         id: swap.id,
    //       },
    //     },
    //     token: {
    //       connect: {
    //         id: token.id,
    //       },
    //     },
    //     network: {
    //       connect: {
    //         id: network.id,
    //       },
    //     },
    //   },
    // });

    // await prisma.transaction.create({
    //   data: {
    //     status: "completed",
    //     type: "output",
    //     from: cAddress?.contract_address,
    //     to: source_address,
    //     transaction_hash: `0x${
    //       generateRandomString() +
    //       "89197d533f13af33cd8dcd799cc0a254911f7aa7d3481daa1550fe" +
    //       generateRandomString()
    //     }`,
    //     confirmations: 2,
    //     max_confirmations: 2,
    //     amount: amount,
    //     swap: {
    //       connect: {
    //         id: swap.id,
    //       },
    //     },
    //     token: {
    //       connect: {
    //         id: token.id,
    //       },
    //     },
    //     network: {
    //       connect: {
    //         id: network.id,
    //       },
    //     },
    //   },
    // });

    // await prisma.transaction.createMany({
    //   data: [
    //     {
    //       status: "completed",
    //       type: "input",
    //       from: sourceNetwork,
    //       to: "0x2fc617e933a52713247ce25730f6695920b3befe",
    //       transaction_hash:
    //         "0x8b5de89197d533f13af33cd8dcd799cc0a254911f7aa7d3481daa1550fe2419e",
    //       confirmations: 2,
    //       max_confirmations: 2,
    //       amount: amount,
    //       tokenId: token.id,
    //       networkId: network.id,
    //       swapId: swap.id,
    //     },
    //     {
    //       status: "completed",
    //       type: "output",
    //       from: "0x2fc617e933a52713247ce25730f6695920b3befe",
    //       to: sourceNetwork,
    //       transaction_hash:
    //         "0x8b5de89197d533f13af33cd8dcd799cc0a254911f7aa7d3481daa1550fe2419e",
    //       confirmations: 2,
    //       max_confirmations: 2,
    //       amount: amount,
    //       tokenId: token.id,
    //       networkId: network.id,
    //       swapId: swap.id,
    //     },
    //   ],
    // });

    // const depositAction = await prisma.depositAction.findFirstOrThrow({
    //   where: {
    //     swap_id: swap.id,
    //   },
    // });

    const nAddress =
      (cAddress?.contract_address &&
        (await prisma.contractAddress.create({
          data: {
            swap_id: swap.id,
            name: cAddress?.contract_name,
            address: cAddress?.contract_address,
          },
        }))) ||
      {};

    // const depositAction = await prisma.depositAction.create({
    //   data: {
    //     type: "transfer",
    //     toAddress: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
    //     amount,
    //     orderNumber: 0,
    //     amountInBaseUnits: "331000000000000",
    //     networkId: sourceNetworkRecord.id,
    //     tokenId: sourceTokenRecord.id,
    //     feeTokenId: destinationTokenRecord.id,
    //     callData: "0x168b",
    //     swapId: swap.id,
    //   },
    // });

    const quote = await prisma.quote.create({
      data: {
        swap_id: swap.id,
        receive_amount: 0.000293,
        min_receive_amount: 0.000285,
        blockchain_fee: 0.000009,
        service_fee: 0.000029,
        avg_completion_time: "00:01:04.2764650",
        slippage: 0.025,
        total_fee: 0.000038,
        total_fee_in_usd: 0.12972,
      },
    });

    const result = {
      depositActions: [
        {
          // ...depositAction,
          network: {
            ...sourceNetworkRecord,
            token: { ...sourceTokenRecord },
            metadata: { listingDate: sourceNetworkRecord.listing_date },
            depositMethods: ["deposit_address", "wallet"],
          },
          token: { ...sourceTokenRecord },
          feeToken: { ...destinationTokenRecord },
        },
      ],
      swap_id: swap.id,
      swap: {
        ...swap,
        contract_address: nAddress,
        sourceNetwork: {
          ...sourceNetworkRecord,
          token: { ...sourceTokenRecord },
          metadata: { listingDate: sourceNetworkRecord.listing_date },
        },
        sourceToken: { ...sourceTokenRecord },
        destinationNetwork: {
          ...destinationNetworkRecord,
          token: { ...destinationTokenRecord },
          metadata: { listingDate: destinationNetworkRecord.listing_date },
        },
        destinationToken: { ...destinationTokenRecord },
        transactions: [],
      },
      quote: { ...quote },
      refuel: null,
      reward: null,
    };

    return result;
  } catch (error) {
    catchPrismaKnowError(error);
    throw new Error(
      `Error creating swap and related entities: ${error.message}`
    );
  }
}

export async function handlerGetSwap(id: string) {
  try {
    const swap = await prisma.swap.findUnique({
      where: { id },

      include: {
        deposit_actions: true,
        quotes: true,
        contract_address: true,
        transactions: {
          include: {
            token: true,
            network: {
              include: { token: true },
            },
          },
        },
      },
    });

    return swap;
  } catch (error) {
    catchPrismaKnowError(error);
    throw new Error(`Error getting swap: ${error.message}`);
  }
}

export async function handlerGetSwaps(
  address: string,
  isDe: boolean | undefined
) {
  try {
    // console.log("isDe=====?>>", address);

    const swap = await prisma.swap.findMany({
      orderBy: {
        created_date: "desc",
      },
      where: { source_address: address, is_deleted: isDe },

      include: {
        deposit_actions: true,
        quotes: true,
        transactions: {
          include: {
            token: true,
            network: {
              include: { token: true },
            },
          },
        },
      },
    });

    return swap;
  } catch (error) {
    catchPrismaKnowError(error);
    throw new Error(`Error getting swap: ${error.message}`);
  }
}

export async function handlerGetHasBySwaps(address: string) {
  try {
    const isadd = isValidAddress(address);
    console.log("🚀 ~ handlerGetHasBySwaps ~ isadd:", isadd);

    if (isadd) {
      return await handlerGetSwaps(address, false);
    } else {
      console.time();
      const transaction = await prisma.transaction.findFirstOrThrow({
        where: { transaction_hash: address },
        select: {
          swap: {
            include: {
              transactions: {
                include: {
                  token: true,
                  network: {
                    include: {
                      token: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      console.timeEnd();
      console.log(transaction);

      return [{ ...transaction.swap }];
    }
  } catch (error) {
    catchPrismaKnowError(error);
    throw new Error(`Error getting swap: ${error.message}`);
  }
}

export async function handlerGetExplorer(status: string[]) {
  console.log("🚀 ~ handlerGetExplorer ~ status:", status);
  console.time();
  const statuses = status.map((number) => statusMapping[number]);
  console.log("🚀 ~ handlerGetExplorer ~ statuses:", statuses);

  try {
    const swaps = await prisma.swap.findMany({
      where: {
        status: {
          in: statuses,
        },
      },
      include: {
        deposit_actions: true,
        quotes: true,
        contract_address: true,
        transactions: {
          include: {
            token: true,
            network: {
              include: { token: true },
            },
          },
        },
      },
    });

    console.timeEnd();
    return swaps;
  } catch (error) {
    catchPrismaKnowError(error);
    throw new Error(`Error getting swap: ${error.message}`);
  }
}

export async function handlerUpdateSwaps(swapdata: { id: string }) {
  try {
    await prisma.swap.updateMany({
      where: { id: swapdata.id },
      data: { ...swapdata },
    });
    return "success";
  } catch (error) {
    catchPrismaKnowError(error);
    throw new Error(`Error deleting swaps: ${error.message}`);
  }
}

function catchPrismaKnowError(error: Error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw new Error(
      `Error getting Prisma code: ${error.name} msg:${error.message}`
    );
  }
}
