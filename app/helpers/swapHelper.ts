import prisma from "../lib/db";
import { Prisma } from "@prisma/client";
import { isValidAddress } from "../lib/addressValidator";
import { statusMapping, SwapStatus } from "../Models/SwapStatus";
import { TransactionType } from "../Models/TransactionTypes";
import { getTokenPrice } from "./tokenHelper";
import { getAvailableDepositAddress, getCurrentBlockNumber } from "@/lib/utils";

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
    [property: string]: any;
}

export type UpdateSwapData = {
    confirmations: number;
    max_confirmations: number;
    amount: string | number;
    form: string;
    to: string;
    id: string;
    add_output_tx: string;
    add_input_tx: string;
    // [property: string]: any;
};
/**
 * Create swap according to users' input
 * @param data SwapData
 * @returns swap result
 */
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
        use_deposit_address
    } = data;


    // current block number
    const block_number = await getCurrentBlockNumber(source_network).catch(err => {
        throw new Error(
            `Error fetching block number for chain ${source_network}`
        );
    });
    // get available deposit address
    const deposit_address_id = await getAvailableDepositAddress (source_network, source_asset);

    try {
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
                block_number,
                deposit_address_id,
                status: SwapStatus.UserTransferPending,
                quotes: {},
            },
        });
        // source network
        const sourceNetwork = await prisma.network.findFirst({
            where: {
                internal_name: source_network
            }
        });
        // source currency
        const sourceCurrency = await prisma.currency.findFirst({
            where: {
                network_id: sourceNetwork?.id,
                asset: source_asset
            }
        });
        // native currency for fee pay
        const nativeCurrency = await prisma.currency.findFirst({
            where: {
                network_id: sourceNetwork?.id,
                is_native: true
            }
        });
        // deposit actions
        const depositAction = await prisma.depositAction.create({
            data: {
                type: "userDeposit",
                to_address: destination_address,
                amount,
                order_number: 0,
                amount_in_base_units: "331000000000000",
                network_id: Number(sourceNetwork?.id),
                currency_id: Number(sourceCurrency?.id),
                fee_currency_id: Number(nativeCurrency?.id),
                call_data: "0x168b",
                swap_id: swap.id,
            },
        });

        // estimate swap rate
        const [sourcePrice, destinationPrice] = await Promise.all([
            getTokenPrice(source_asset),
            getTokenPrice(destination_asset),
        ]);
        const receive_amount =
            (Number(amount) * sourcePrice) / destinationPrice;

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
                total_fee_in_usd: 0,
            },
        });

        const result = {
            depositActions: [
                {
                    ...depositAction,
                    network: sourceNetwork,
                    currency: sourceCurrency,
                    feeCurrency: nativeCurrency
                }
            ],
            swap_id: swap.id,
            swap,
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
            currency: {
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

export async function handlerGetSwap(id: string) {
    try {
        const swap = await prisma.swap.findUnique({
            where: { id },
            include: {
                deposit_actions: true,
                quotes: true,
                deposit_address: true,
                transactions: {
                    include: {
                        currency: true,
                        network: {
                            include: { currencies: false },
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
        const swap = await prisma.swap.findMany({
            orderBy: {
                created_date: "desc",
            },
            where: { source_address: address },
            include: {
                // deposit_actions: {
                //     include: {
                //         network: true,
                //         currency: true,
                //         fee_currency: true
                //     }
                // },
                deposit_actions: true,
                deposit_address: true,
                quotes: true,
                transactions: {
                    include: {
                        currency: true,
                        network: {
                            include: { currencies: false },
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
                                    currency: true,
                                    network: {
                                        include: {
                                            currencies: true,
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
    console.time();
    const statuses = status.map((number) => statusMapping[number]);
    console.log("🚀 ~ handlerGetExplorer ~ statuses:", statuses);

    try {
        const swaps = await prisma.swap.findMany({
            orderBy: {
                created_date: "desc",
            },
            where: {
                status: {
                    in: statuses,
                },
            },
            include: {
                deposit_actions: true,
                quotes: true,
                deposit_address: true,
                transactions: {
                    include: {
                        currency: true,
                        network: {
                            include: { currencies: true },
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

export async function handlerUpdateSwaps(swapData: { id: string }) {
    try {
        await prisma.swap.updateMany({
            where: { id: swapData.id },
            data: { ...swapData },
        });
        return "success";
    } catch (error) {
        catchPrismaKnowError(error);
        throw new Error(`Error deleting swaps: ${error.message}`);
    }
}

export async function handlerUpdateSwap(swapData: UpdateSwapData) {
    try {
        if (swapData.add_input_tx) {
            await prisma.transaction.create({
                data: {
                    status: "completed",
                    type: TransactionType.Input,
                    from: swapData.form,
                    to: swapData.to,
                    transaction_hash: swapData.add_input_tx,
                    confirmations: 2,
                    max_confirmations: 2,
                    amount: Number(swapData.amount),
                    swap: {
                        connect: {
                            id: swapData.id,
                        },
                    },
                },
            });

            await prisma.swap.update({
                where: { id: swapData.id },
                data: {
                    status: SwapStatus.BridgeTransferPending,
                },
            });
            return "success";
        } else if (swapData.add_output_tx) {
            await prisma.transaction.create({
                data: {
                    status: "completed",
                    type: TransactionType.Output,
                    from: swapData.form,
                    to: swapData.to,
                    transaction_hash: swapData.add_output_tx,
                    confirmations: 2,
                    max_confirmations: 2,
                    amount: Number(swapData.amount),
                    swap: {
                        connect: {
                            id: swapData.id,
                        },
                    },
                },
            });
            await prisma.swap.update({
                where: { id: swapData.id },
                data: {
                    status: SwapStatus.Completed,
                },
            });
            return "success";
        } else {
            return "failed";
        }
    } catch (error) {
        catchPrismaKnowError(error);
        throw new Error(`Error deleting swaps: ${error.message}`);
    }
}

export async function handlerDelSwap(swapData: { id: string }) {
    try {
        await prisma.swap.update({
            where: { id: swapData.id },
            data: { ...swapData },
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
