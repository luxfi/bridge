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
    const sourceNetworkRecord = await prisma.network.create({
      data: {
        name: sourceNetwork,
        displayName: "Ethereum Sepolia",
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/ethereum_sepolia.png",
        chainId: "11155111",
        nodeUrl:
          "https://eth-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
        type: "evm",
        transactionExplorerTemplate: "https://sepolia.etherscan.io/tx/{0}",
        accountExplorerTemplate: "https://sepolia.etherscan.io/address/{0}",
        listingDate: new Date(),
      },
    });

    const destinationNetworkRecord = await prisma.network.create({
      data: {
        name: destinationNetwork,
        displayName: "Arbitrum One Sepolia",
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/arbitrum_sepolia.png",
        chainId: "421614",
        nodeUrl:
          "https://arbitrum-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
        type: "evm",
        transactionExplorerTemplate: "https://sepolia.arbiscan.io/tx/{0}",
        accountExplorerTemplate: "https://sepolia.arbiscan.io/address/{0}",
        listingDate: new Date(),
      },
    });

    const sourceTokenRecord = await prisma.token.create({
      data: {
        symbol: sourceToken,
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
        contract: null,
        decimals: 18,
        priceInUsd: 3413.69,
        precision: 6,
        listingDate: new Date(),
      },
    });

    const destinationTokenRecord = await prisma.token.create({
      data: {
        symbol: destinationToken,
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
        contract: null,
        decimals: 18,
        priceInUsd: 3413.69,
        precision: 6,
        listingDate: new Date(),
      },
    });

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

      include: { depositActions: true, quotes: true, contractAddress: true },
    });

    return {
      ...swap,
      transactions: [
        {
          from: "0x3d301f2784646316b5ba594559f4afd3d7435edf",
          to: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
          timestamp: "2024-07-16T03:16:36+00:00",
          transaction_hash:
            "0x2ac5d8ec5000437e11d2e41707a5dbe3c86121efbe153575bf60a4a493d25d63",
          confirmations: 3,
          max_confirmations: 3,
          amount: 0.000326,
          type: "input",
          status: "completed",
          token: {
            symbol: "ETH",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
            contract: null,
            decimals: 18,
            price_in_usd: 3413.11,
            precision: 6,
            listing_date: "2023-05-18T13:41:38.401615+00:00",
          },
          network: {
            name: "ETHEREUM_SEPOLIA",
            display_name: "Ethereum Sepolia",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/ethereum_sepolia.png",
            chain_id: "11155111",
            node_url:
              "https://eth-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
            type: "evm",
            transaction_explorer_template:
              "https://sepolia.etherscan.io/tx/{0}",
            account_explorer_template:
              "https://sepolia.etherscan.io/address/{0}",
            token: {
              symbol: "ETH",
              logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
              contract: null,
              decimals: 18,
              price_in_usd: 3413.11,
              precision: 6,
              listing_date: "2023-05-18T13:41:38.401615+00:00",
            },
            metadata: {
              listing_date: "2023-12-27T16:46:50.617075+00:00",
            },
          },
        },
        {
          from: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
          to: "0x3d301f2784646316b5ba594559f4afd3d7435edf",
          timestamp: "2024-07-16T03:17:13+00:00",
          transaction_hash:
            "0xba4fc26d059f7268d825ffb0bad54878778d09cd9bdca59f7f241a233834b26b",
          confirmations: 1,
          max_confirmations: 1,
          amount: 0.000288,
          type: "output",
          status: "completed",
          token: {
            symbol: "ETH",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
            contract: null,
            decimals: 18,
            price_in_usd: 3413.11,
            precision: 6,
            listing_date: "2023-05-18T13:41:38.555738+00:00",
          },
          network: {
            name: "ARBITRUM_SEPOLIA",
            display_name: "Arbitrum One Sepolia",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/arbitrum_sepolia.png",
            chain_id: "421614",
            node_url:
              "https://arbitrum-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
            type: "evm",
            transaction_explorer_template: "https://sepolia.arbiscan.io/tx/{0}",
            account_explorer_template:
              "https://sepolia.arbiscan.io/address/{0}",
            token: {
              symbol: "ETH",
              logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
              contract: null,
              decimals: 18,
              price_in_usd: 3413.11,
              precision: 6,
              listing_date: "2023-05-18T13:41:38.555738+00:00",
            },
            metadata: {
              listing_date: "2023-12-27T16:46:50.617075+00:00",
            },
          },
        },
      ],
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

      // include: { depositActions: true, quotes: true },
    });
    swap.map((swap) => {
      swap.transactions = [
        {
          from: "0x3d301f2784646316b5ba594559f4afd3d7435edf",
          to: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
          timestamp: "2024-07-16T03:16:36+00:00",
          transaction_hash:
            "0x2ac5d8ec5000437e11d2e41707a5dbe3c86121efbe153575bf60a4a493d25d63",
          confirmations: 3,
          max_confirmations: 3,
          amount: 0.000326,
          type: "input",
          status: "completed",
          token: {
            symbol: "ETH",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
            contract: null,
            decimals: 18,
            price_in_usd: 3413.11,
            precision: 6,
            listing_date: "2023-05-18T13:41:38.401615+00:00",
          },
          network: {
            name: "ETHEREUM_SEPOLIA",
            display_name: "Ethereum Sepolia",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/ethereum_sepolia.png",
            chain_id: "11155111",
            node_url:
              "https://eth-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
            type: "evm",
            transaction_explorer_template:
              "https://sepolia.etherscan.io/tx/{0}",
            account_explorer_template:
              "https://sepolia.etherscan.io/address/{0}",
            token: {
              symbol: "ETH",
              logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
              contract: null,
              decimals: 18,
              price_in_usd: 3413.11,
              precision: 6,
              listing_date: "2023-05-18T13:41:38.401615+00:00",
            },
            metadata: {
              listing_date: "2023-12-27T16:46:50.617075+00:00",
            },
          },
        },
        {
          from: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
          to: "0x3d301f2784646316b5ba594559f4afd3d7435edf",
          timestamp: "2024-07-16T03:17:13+00:00",
          transaction_hash:
            "0xba4fc26d059f7268d825ffb0bad54878778d09cd9bdca59f7f241a233834b26b",
          confirmations: 1,
          max_confirmations: 1,
          amount: 0.000288,
          type: "output",
          status: "completed",
          token: {
            symbol: "ETH",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
            contract: null,
            decimals: 18,
            price_in_usd: 3413.11,
            precision: 6,
            listing_date: "2023-05-18T13:41:38.555738+00:00",
          },
          network: {
            name: "ARBITRUM_SEPOLIA",
            display_name: "Arbitrum One Sepolia",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/arbitrum_sepolia.png",
            chain_id: "421614",
            node_url:
              "https://arbitrum-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
            type: "evm",
            transaction_explorer_template: "https://sepolia.arbiscan.io/tx/{0}",
            account_explorer_template:
              "https://sepolia.arbiscan.io/address/{0}",
            token: {
              symbol: "ETH",
              logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
              contract: null,
              decimals: 18,
              price_in_usd: 3413.11,
              precision: 6,
              listing_date: "2023-05-18T13:41:38.555738+00:00",
            },
            metadata: {
              listing_date: "2023-12-27T16:46:50.617075+00:00",
            },
          },
        },
      ];
    });

    return [...swap];
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
