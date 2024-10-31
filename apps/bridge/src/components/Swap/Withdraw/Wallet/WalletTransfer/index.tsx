'use client'
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { type PublishedSwapTransactions } from "../../../../../lib/BridgeApiClient";
import TransferNativeTokenButton from "./TransferNativeToken";
import { ChangeNetworkButton, ConnectWalletButton } from "./buttons";
import TransferErc20Button from "./TransferErc20";

const TransferFromWallet: React.FC<{
  sequenceNumber: number
  chainId: number
  depositAddress?: `0x${string}`
  tokenContractAddress?: `0x${string}` | null
  userDestinationAddress: `0x${string}`
  amount: number
  tokenDecimals: number
  networkDisplayName: string
  swapId: string
}> = ({ 
  networkDisplayName,
  chainId,
  depositAddress,
  userDestinationAddress,
  amount,
  tokenContractAddress,
  tokenDecimals,
  sequenceNumber,
  swapId,
}) => {
  const { isConnected } = useAccount();

  const [savedTransactionHash, setSavedTransactionHash] = useState<string>();

  // useEffect(() => {
  //     if (activeChain?.id === chainId)
  //         networkChange.reset()
  // }, [activeChain, chainId])

  useEffect(() => {
    try {
      const data: PublishedSwapTransactions = JSON.parse(
        localStorage.getItem("swapTransactions") || "{}"
      );
      const hash = data.state.swapTransactions?.[swapId]?.hash;
      if (hash) setSavedTransactionHash(hash);
    } catch (e: any) {
      //TODO log to logger
      console.error(e.message);
    }
  }, [swapId]);

  const hexed_sequence_number = sequenceNumber?.toString(16);
  const sequence_number_even =
    hexed_sequence_number?.length % 2 > 0
      ? `0${hexed_sequence_number}`
      : hexed_sequence_number;

  if (!isConnected) {
    return <ConnectWalletButton />;
    //   }
    //   else if (activeChain?.id !== chainId) {
    //     return (
    //       <ChangeNetworkButton chainId={chainId} network={networkDisplayName} />
    //     );
  } else if (tokenContractAddress) {
    return (
      <TransferErc20Button
        swapId={swapId}
        sequenceNumber={sequence_number_even}
        amount={amount}
        depositAddress={depositAddress}
        userDestinationAddress={userDestinationAddress}
        savedTransactionHash={savedTransactionHash as `0x${string}`}
        tokenContractAddress={tokenContractAddress}
        tokenDecimals={tokenDecimals}
      />
    );
  } else {
    return (
      <TransferNativeTokenButton
        swapId={swapId}
        sequenceNumber={sequence_number_even}
        amount={amount}
        depositAddress={depositAddress}
        userDestinationAddress={userDestinationAddress}
        savedTransactionHash={savedTransactionHash as `0x${string}`}
        chainId={chainId}
      />
    );
  }
};

export default TransferFromWallet;
