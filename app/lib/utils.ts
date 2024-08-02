import { Prisma } from "@prisma/client";
import prisma from "../lib/db";
import { Web3, HttpProvider } from 'web3';
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

const _getWeb3 = async (rpcList: string[]) => {
    for (let i = 0; i < rpcList.length; i++) {
        const rpcUrl = rpcList[i];
        console.log(rpcUrl)
        const web3 = new Web3(new HttpProvider(String(rpcUrl)));
        try {
            await web3.eth.net.isListening();
            return Promise.resolve(web3);
        } catch (err) {
            console.log('next rpc...')
        }
    }
    return Promise.reject("cannot connect");
};

/**
 * get current block number
 * @param network 
 */
export const getCurrentBlockNumber = async (network_name: string) => {
    try {
        const _network = await prisma.network.findUnique({
            where: {
                internal_name: network_name
            },
            include: {
                nodes: true
            }
        });
        if (_network?.type === 'evm') {
            const web3 = await _getWeb3(_network.nodes.map(n => n.url)).catch(err => {
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
/**
 * get available deposit address
 * @param network 
 * @param asset 
 * @returns 
 */
export const getAvailableDepositAddress = async (network: string, asset: string) => {
    try {
        // source network
        const _network = await prisma.network.findUnique ({
            where: {
                internal_name: network
            }
        });
        // source asset
        const _asset = await prisma.currency.findFirst({
            where: {
                network_id: _network?.id,
                asset: asset
            }
        });
        const data: any = await prisma.$queryRaw`
            SELECT id FROM "DepositAddress" WHERE type=${_network?.type} and id NOT IN (
                SELECT deposit_address_id as id FROM "Swap"
                WHERE source_network_id=${_network?.id} AND source_asset_id=${_asset?.id} AND status='user_transfer_pending'
            )
        `
        console.log(data)
        if (data[0]) {
            return Promise.resolve(data[0].id);
        } else {
            throw "no free deposit address";
        }
    } catch (err) {
        console.log(err)
        return Promise.reject("No free deposit address for this asset")
    }
}