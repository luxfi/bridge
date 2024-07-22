import { Prisma } from "@prisma/client";
import { number } from "joi";

import prisma from "../../lib/db";

export interface SwapData {
  amount: number;
  sourceNetwork: string;
  destinationNetwork: string;
  sourceToken: string;
  destinationToken: string;
  destinationAddress: string;
  refuel: boolean;
  useDepositAddress: boolean;
  sourceAddress: string;
  contractAddress: {
    contract_name: string;
    contract_address: string;
  };
}

export async function handleSwapCreation(data: SwapData) {
  const {
    amount,
    sourceNetwork,
    destinationNetwork,
    sourceToken,
    destinationToken,
    destinationAddress,
    refuel,
    useDepositAddress,
    sourceAddress,
    contractAddress: cAddress,
  } = data;

  try {
    // 首先创建 Token
    const token = await prisma.token.create({
      data: {
        symbol: "ETH",
        logo: "https://prodlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
        contract: "0",
        decimals: 18,
        priceInUsd: 3482.44,
        precision: 8,
        listingDate: new Date("2021-12-21T16:59:11.139Z"),
      },
    });

    // 然后创建 Network
    const network = await prisma.network.create({
      data: {
        name: "ZKSYNC_MAINNET",
        displayName: "zkSync Lite",
        logo: "https://prodlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/zksync_mainnet.png",
        chainId: "mainnet",
        nodeUrl: "https://api.zksync.io/",
        type: "zksynclite",
        transactionExplorerTemplate:
          "https://zkscan.io/explorer/transactions/{0}",
        accountExplorerTemplate: "https://zkscan.io/explorer/accounts/{0}",
        listingDate: new Date("2021-12-21T16:59:11.139Z"),
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
        requestedAmount: amount,
        sourceNetworkName: sourceNetwork,
        destinationNetworkName: destinationNetwork,
        sourceTokenSymbol: sourceToken,
        destinationTokenSymbol: destinationToken,
        destinationAddress,
        refuel,
        useDepositAddress,
        sourceAddress,
        status: "user_transfer_pending",
        depositActions: {
          createMany: {
            data: [
              {
                type: "transfer",
                toAddress: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
                amount,
                orderNumber: 0,
                amountInBaseUnits: "331000000000000",
                networkId: sourceNetworkRecord.id,
                tokenId: sourceTokenRecord.id,
                feeTokenId: destinationTokenRecord.id,
                callData: "0x168b",
              },
            ],
          },
        },
        quotes: {},
      },
    });

    // 最后创建 Transaction
    // const transaction = await prisma.transaction.create({
    //   data: {
    //     status: "completed",
    //     type: "input",
    //     from: "0xc9cbb47b26e720c2e70c964f190f1f2d4714a5a8",
    //     to: "0x2fc617e933a52713247ce25730f6695920b3befe",
    //     transaction_hash:
    //       "0x8b5de89197d533f13af33cd8dcd799cc0a254911f7aa7d3481daa1550fe2419e",
    //     confirmations: 2,
    //     max_confirmations: 2,
    //     amount: 0.0009935399091,
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

    await prisma.transaction.createMany({
      data: [
        {
          status: "completed",
          type: "input",
          from: sourceNetwork,
          to: "0x2fc617e933a52713247ce25730f6695920b3befe",
          transaction_hash:
            "0x8b5de89197d533f13af33cd8dcd799cc0a254911f7aa7d3481daa1550fe2419e",
          confirmations: 2,
          max_confirmations: 2,
          amount: amount,
          tokenId: token.id,
          networkId: network.id,
          swapId: swap.id,
        },
        {
          status: "completed",
          type: "output",
          from: "0x2fc617e933a52713247ce25730f6695920b3befe",
          to: sourceNetwork,
          transaction_hash:
            "0x8b5de89197d533f13af33cd8dcd799cc0a254911f7aa7d3481daa1550fe2419e",
          confirmations: 2,
          max_confirmations: 2,
          amount: amount,
          tokenId: token.id,
          networkId: network.id,
          swapId: swap.id,
        },
      ],
    });

    const depositAction = await prisma.depositAction.findFirstOrThrow({
      where: {
        swapId: swap.id,
      },
    });

    const nAddress =
      (cAddress?.contract_address &&
        (await prisma.contractAddress.create({
          data: {
            swapId: swap.id,
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
        swapId: swap.id,
        receiveAmount: 0.000293,
        minReceiveAmount: 0.000285,
        blockchainFee: 0.000009,
        serviceFee: 0.000029,
        avgCompletionTime: "00:01:04.2764650",
        slippage: 0.025,
        totalFee: 0.000038,
        totalFeeInUsd: 0.12972,
      },
    });

    const result = {
      depositActions: [
        {
          ...depositAction,
          network: {
            ...sourceNetworkRecord,
            token: { ...sourceTokenRecord },
            metadata: { listingDate: sourceNetworkRecord.listingDate },
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
          metadata: { listingDate: sourceNetworkRecord.listingDate },
        },
        sourceToken: { ...sourceTokenRecord },
        destinationNetwork: {
          ...destinationNetworkRecord,
          token: { ...destinationTokenRecord },
          metadata: { listingDate: destinationNetworkRecord.listingDate },
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
        depositActions: true,
        quotes: true,
        contractAddress: true,
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
    });
    console.log("🚀 ~ handlerGetSwap ~ swap:", swap, swap?.id);

    return {
      ...swap,
    };
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
        createdDate: "desc",
      },
      where: { sourceAddress: address, isDeleted: isDe },

      include: {
        depositActions: true,
        quotes: true,
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
    });

    return swap;
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
      `Error getting Prisma code: ${error.code} msg:${error.message}`
    );
  }
}
