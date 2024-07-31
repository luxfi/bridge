import { Prisma } from "@prisma/client";
import prisma from "../lib/db";
import Web3 from 'web3';

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
            
        }
    } catch (err) {
        return Promise.reject("err to fetch block number")
    }
}