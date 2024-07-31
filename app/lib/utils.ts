import { Prisma } from "@prisma/client";
import prisma from "../lib/db";
import Web3 from 'web3';
import { rpc } from "viem/utils";

/**
 * generate random string
 * @returns STRING
 */
export const generateRandomString = (): string => {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 5; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * get current block number
 * @param network 
 */
export const getCurrentBlockNumber = async (network_name: string) => {
    try {
        const _network = await prisma.network.findUnique({
            where: {
                internal_name: network_name
            }
        });
        if (_network?.type === 'evm') {
            const rpcUrl = _network.node_url;
            const web3 = new Web3(new Web3.providers.HttpProvider(String(rpcUrl)));
            await web3.eth.net.isListening ().catch (err => {
                throw "cannot connect to rpc..."
            });
            const blockNumber = await web3.eth.getBlockNumber();
            return Promise.resolve(Number(blockNumber));   
        }
        throw "not evm"
    } catch (err) {
        return Promise.reject(0)
    }
}

export const getAvailableDepositAddress = async (network: string, asset: string) => {
    const data = await prisma.swap.findMany({
        where: {
            source_network: network,
            source_asset: asset
        },
        select: {
            
        }
    });
}