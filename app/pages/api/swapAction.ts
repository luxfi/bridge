import { Prisma } from "@prisma/client";
import { number } from "joi";

import prisma from "../../lib/db";

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
    cAddress
  })

  try {
    const sourceNetworkRecord = await prisma.network.create({
      data: {
        name: source_network,
        display_name: "Ethereum Sepolia",
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/ethereum_sepolia.png",
        chain_id: "11155111",
        node_url:
          "https://eth-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
        type: "evm",
        transaction_explorer_template: "https://sepolia.etherscan.io/tx/{0}",
        account_explorer_template: "https://sepolia.etherscan.io/address/{0}",
        listing_date: new Date(),
      },
    });

    const destinationNetworkRecord = await prisma.network.create({
      data: {
        name: destination_network,
        display_name: "Arbitrum One Sepolia",
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/networks/arbitrum_sepolia.png",
        chain_id: "421614",
        node_url:
          "https://arbitrum-sepolia.blastapi.io/84acb0b4-99f6-4a3d-9f63-15d71d9875ef",
        type: "evm",
        transaction_explorer_template: "https://sepolia.arbiscan.io/tx/{0}",
        account_explorer_template: "https://sepolia.arbiscan.io/address/{0}",
        listing_date: new Date(),
      },
    });

    const sourceTokenRecord = await prisma.token.create({
      data: {
        symbol: source_asset,
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
        contract: null,
        decimals: 18,
        price_in_usd: 3413.69,
        precision: 6,
        listing_date: new Date(),
      },
    });

    const destinationTokenRecord = await prisma.token.create({
      data: {
        symbol: destination_asset,
        logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
        contract: null,
        decimals: 18,
        price_in_usd: 3413.69,
        precision: 6,
        listing_date: new Date(),
      },
    });

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
        status: "user_transfer_pending",
        deposit_actions: {
          createMany: {
            data: [
              {
                type: "transfer",
                to_address: "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
                amount,
                order_number: 0,
                amount_in_base_units: "331000000000000",
                network_id: sourceNetworkRecord.id,
                token_id: sourceTokenRecord.id,
                fee_token_id: destinationTokenRecord.id,
                call_data: "0x168b",
              },
            ],
          },
        },
        quotes: {},
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        swap_id: swap.id,
        status: "pending",
        type: "swap",
        from: "0x222www2",
        to: "0x31232xxx",
        transaction_hash: "0x343112222s",
        confirmations: 2,
        max_confirmations: 2,
        amount: 0.3,
      },
    });

    const depositAction = await prisma.depositAction.findFirstOrThrow({
      where: {
        swap_id: swap.id,
      },
    });

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
          ...depositAction,
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
        transactions: true,
      },
    });

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
        created_date: "desc",
      },
      where: { source_address: address, is_deleted: isDe },

      include: { deposit_actions: true, quotes: true, transactions: true },
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
      `Error getting Prisma code: ${error.name} msg:${error.message}`
    );
  }
}
