import type { NextApiRequest, NextApiResponse } from "next";
import { getTokenPrice } from "../../../helpers/tokenHelper";

/**
 * get quote swap information
 * api/quote?source_network=&source_token=&destination_network=&destination_token=&amount=&refuel=&use_deposit_address=
 * @param req 
 * @param res 
 * @returns 
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<{}>
) {
    // source_network=ETHEREUM_SEPOLIA&source_token=USDC&destination_network=ARBITRUM_SEPOLIA&destination_token=USDC&amount=1.245766&refuel=false&use_deposit_address=false
    try {
        const {
            source_network,
            source_token,
            destination_network,
            destination_token,
            amount,
            refuel,
            use_deposit_address,
        } = req.query;

        const [sourcePrice, destinationPrice] = await Promise.all([
            getTokenPrice(String(source_token)),
            getTokenPrice(String(destination_token))
        ]);

        return res.status(200).json({
            data: {
                quote: {
                    receive_amount: Number(amount) * sourcePrice / destinationPrice,
                    min_receive_amount: 0.975,
                    blockchain_fee: 0.145766, //we need to estimate blockchain fee.
                    service_fee: 0.01, //our bridge service fee is 1%. or We should make no fee for our bridge currently.
                    avg_completion_time: "00:00:47.4595530", // it should be about 20 min for btc, and 3 ~ 4 mins for evm chains.
                    refuel_in_source: null,
                    slippage: 0.025,
                    total_fee: 0.245766,
                    total_fee_in_usd: 0.245766,
                },
                refuel: null,
                reward: {},
            },
        });
    } catch (error) {
        console.error("Error in fetching destinations", error);
        res.status(500).json({ data: error.message });
    }
}
