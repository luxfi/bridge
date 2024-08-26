export const settings = {
  RPC: {
    11155111: "https://sepolia.infura.io/v3/2e58a899d3c64eccb6955c2f33fc8a88",
    97: "https://data-seed-prebsc-1-s1.bnbchain.org:8545"
  },
  LuxETH: {
    Ethereum: "0x42449554b0c7D85EbD488e14D7D48c6A78D3F9Be",
    Lux: "0x41e51eFcdA08fDFB84f4b1caa4b7f03c67FA431b"
  },
  LuxBTC: {
    Ethereum: "0x526903Ee6118de6737D11b37f82fC7f69B13685D",
    Lux: "0x8c07F93A76213c0BE738ded6110403b6d0ceE286"
  },
  // WSHM: {
  //   "Ethereum": "0xc1Dd1e835F4cdFF9fc12Cb1750428E345A3d3d5f",
  //   "Lux": "0x2d6Bce32Ea63F2e2CDfCAd49999e89a00389Df4C",
  // },
  Teleporter: {
    Ethereum: "0x5519582dde6eb1f53F92298622c2ecb39A64369A",
    Lux: "0x42449554b0c7D85EbD488e14D7D48c6A78D3F9Be"
  },
  NetNames: {
    "11155111": "Ethereum",
    "97": "Lux"
  },
  Msg: "Sign to prove you are initiator of transaction.",
  DupeListLimit: "200",
  SMTimeout: "1",
  NewSigAllowed: false,
  SigningManagers: ["http://127.0.0.1:8000", "http://127.0.0.1:8000"],
  MPCPeers: {
    0: "mnode.wpkt.cash, 139.162.85.205",
    1: "mnode.odapp.io, 172.104.108.56"
  },
  KeyStore: "keys.store"
}
