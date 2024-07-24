import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../../settings";

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

    return res.status(200).json({
      data: {
        quote: {
          receive_amount: 1,
          min_receive_amount: 0.975,
          blockchain_fee: 0.145766,
          service_fee: 0.1,
          avg_completion_time: "00:00:47.4595530",
          refuel_in_source: null,
          slippage: 0.025,
          total_fee: 0.245766,
          total_fee_in_usd: 0.245766,
        },
        refuel: null,
        reward: {
          token: {
            symbol: "ETH",
            logo: "https://devlslayerswapbridgesa.blob.core.windows.net/layerswap/currencies/eth.png",
            contract: null,
            decimals: 18,
            price_in_usd: 3470.62,
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
            token: null,
            metadata: {
              listing_date: "2023-12-27T16:46:50.617075+00:00",
            },
          },
          amount: 0.000029,
          amount_in_usd: 0.10064798,
        },
      },
    });
  } catch (error) {
    console.error("Error in fetching destinations", error);
    res.status(500).json({ data: error.message });
  }
}
