import { getDefaultConfig } from "@rabby-wallet/rabbykit";
import { createClient, type Chain } from "viem";
import { createConfig, http } from "wagmi";
import { goerli, mainnet } from "wagmi/chains";


const configParams = getDefaultConfig({
  projectId: 'e89228fed40d4c6e9520912214dfd68b',
  appName: "Lux Bridge",
    // @ts-ignore
  chains: [
    mainnet,
    ...(process.env.NODE_ENV === "development" ? [goerli] : []),
  ],
  client({ chain } : { chain: Chain}) {
    return createClient({ chain, transport: http() });
  },
});

    // @ts-ignore
export const config = createConfig(configParams);
