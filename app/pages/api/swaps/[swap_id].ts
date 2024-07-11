import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get dynamic id from URL
  const { swap_id } = req.query

  // Get version from query parameter
  const version = req.query.version;

  console.log({ swap_id, version })
  res.status(200).json({
    "data": {
      "id": "12b21e7e-1e1e-46b4-881f-8e1bd10288c4",
      "source_network": "ETHEREUM_GOERLI",
      "destination_network": "ARBITRUM_GOERLI",
      "amount": 0.009,
      "fee": 0.000227,
      "source_asset": "ETH",
      "destination_asset": "ETH",
      "destination_address": "0x481b173fe7f9ff503d9182d0b9ad6e62336b7733",
      "status": "pending",
      "reference_id": null,
      "app": "AppForTestingAPI",
      "transactions": [
        // {
        //   "from": "0x481b173fe7f9ff503d9182d0b9ad6e62336b7733",
        //   "to": "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
        //   "timestamp": "2023-09-15T15:20:00+00:00",
        //   "transaction_hash": "0x40fa71037f71533051af0c4ff7bc9b3c5f11e58ea2fdf8bb011484e9e1262093",
        //   "confirmations": 3,
        //   "max_confirmations": 3,
        //   "amount": 0.01,
        //   "asset": "ETH",
        //   "type": "input"
        // },
        // {
        //   "from": "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
        //   "to": "0x481b173fe7f9ff503d9182d0b9ad6e62336b7733",
        //   "timestamp": "2023-09-15T15:20:53+00:00",
        //   "transaction_hash": "0xcbc0ea13cb7748e0a9a9a45cd0c5a7bacb967e789e35d7c15b8d2877d5cf1e70",
        //   "confirmations": 3,
        //   "max_confirmations": 3,
        //   "amount": 0.000062,
        //   "asset": "ETH",
        //   "type": "refuel"
        // },
        // {
        //   "from": "0x5da5c2a98e26fd28914b91212b1232d58eb9bbab",
        //   "to": "0x481b173fe7f9ff503d9182d0b9ad6e62336b7733",
        //   "timestamp": "2023-09-15T15:20:53+00:00",
        //   "transaction_hash": "0xd3bb7b528096b149ff9f28158212930ce1a2bf1f674afff04e80c12d1fff435a",
        //   "confirmations": 3,
        //   "max_confirmations": 3,
        //   "amount": 0.009773,
        //   "asset": "ETH",
        //   "type": "output"
        // }
      ]
    },
    "error": null
  });
}
