import { useWalletClient } from "wagmi";
import { providers } from "ethers";
import { useMemo } from "react";

// function publicClientToProvider(publicClient: PublicClient) {
//     const { chain, transport } = publicClient
//     const network = {
//         chainId: chain.id,
//         name: chain.name,
//         ensAddress: chain.contracts?.ensRegistry?.address,
//     }
//     if (transport.type === 'fallback')
//         return new providers.FallbackProvider(
//             (transport.transports as ReturnType<HttpTransport>[]).map(
//                 ({ value }) => new providers.JsonRpcProvider(value?.url, network),
//             ),
//         )
//     return new providers.Web3Provider(transport.url, network)
// }

// /** Hook to convert a viem Public Client to an ethers.js Provider. */
// function useEthersProvider({ chainId }: { chainId?: number } = {}) {
//     const publicClient = usePublicClient({ chainId })
//     return useMemo(() => publicClientToProvider(publicClient), [publicClient])
// }

function walletClientToSigner(walletClient: any) {
  const { account, chain, transport } = walletClient;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };

  // Force disable type checking of transport
  // See https://github.com/wagmi-dev/viem/discussions/792#discussioncomment-6297530
  const provider = new providers.Web3Provider(transport, network);
  const signer = provider.getSigner(account.address);
  return signer;
}

/** Hook to convert a viem Wallet Client to an ethers.js Signer. */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: walletClient } = useWalletClient({ chainId });
  return useMemo(
    () => (walletClient ? walletClientToSigner(walletClient) : undefined),
    [walletClient]
  );
}
