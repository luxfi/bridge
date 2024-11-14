"use client";
import * as zksync from "zksync";
import { Link, ArrowLeftRight } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import SubmitButton from "../../../buttons/submitButton";
import toast from "react-hot-toast";
import { utils } from "ethers";
import { useEthersSigner } from "../../../../lib/ethersToViem/ethers";
import { useSwapTransactionStore } from "../../../../stores/swapTransactionStore";
import { PublishedSwapTransactionStatus } from "../../../../lib/BridgeApiClient";
import { useSwapDataState } from "../../../../context/swap";
import {
  ChangeNetworkButton,
  ConnectWalletButton,
} from "./WalletTransfer/buttons";
import { useSettings } from "../../../../context/settings";
import { type TransactionReceipt } from "zksync/build/types";
import { useChainId } from "wagmi";

type Props = {
  depositAddress: string;
  amount: number;
};

const ZkSyncWalletWithdrawStep: FC<Props> = ({ depositAddress, amount }) => {
  const [loading, setLoading] = useState(false);
  const [transferDone, setTransferDone] = useState<boolean>();
  const [syncWallet, setSyncWallet] = useState<zksync.Wallet | null>();

  const { setSwapTransaction } = useSwapTransactionStore();
  const { swap } = useSwapDataState();
  const signer = useEthersSigner();
  const chainId = useChainId();

  const { layers } = useSettings();
  const { source_network: source_network_internal_name } = swap || {};
  const source_network = layers.find(
    (n) => n.internal_name === source_network_internal_name
  );
  const source_layer = layers.find(
    (l) => l.internal_name === source_network_internal_name
  );
  const source_currency = source_network?.assets?.find(
    (c) =>
      c.asset.toLocaleUpperCase() === swap?.source_asset.toLocaleUpperCase()
  );
  const defaultProvider =
    swap?.source_network?.split("_")?.[1]?.toLowerCase() == "mainnet"
      ? "mainnet"
      : "goerli";
  const l1Network = layers.find(
    (n) => n.internal_name === source_network?.metadata?.L1Network
  );

  useEffect(() => {
    if (signer?._address !== syncWallet?.cachedAddress && source_layer) {
      setSyncWallet(null);
    }
  }, [signer?._address]);

  const handleTransaction = async (
    swapId: string,
    publishedTransaction: TransactionReceipt,
    txHash: string
  ) => {
    if (publishedTransaction?.failReason) {
      txHash &&
        setSwapTransaction(
          swapId,
          PublishedSwapTransactionStatus.Error,
          txHash,
          publishedTransaction?.failReason
        );
      toast(String(publishedTransaction.failReason));
    } else {
      txHash &&
        setSwapTransaction(
          swapId,
          PublishedSwapTransactionStatus.Completed,
          txHash,
          publishedTransaction?.failReason
        );
      setTransferDone(true);
    }
  };

  const handleConnect = useCallback(async () => {
    if (!signer) return;
    setLoading(true);
    try {
      const syncProvider = await zksync.getDefaultProvider(defaultProvider);
      const wallet = await zksync.Wallet.fromEthSigner(signer, syncProvider);
      setSyncWallet(wallet);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setLoading(false);
    }
  }, [signer, defaultProvider]);

  const handleTransfer = useCallback(async () => {
    if (!swap) return;

    setLoading(true);
    try {
      const tf = await syncWallet?.syncTransfer({
        to: depositAddress,
        token: swap?.source_asset,
        amount: zksync.closestPackableTransactionAmount(
          utils.parseUnits(amount.toString(), source_currency?.decimals)
        ),
        validUntil: zksync.utils.MAX_TIMESTAMP - swap?.sequence_number,
      });

      const txHash = tf?.txHash?.replace("sync-tx:", "");

      if (txHash) {
        const syncProvider = await zksync.getDefaultProvider(defaultProvider);
        const txReceipt = await syncProvider.getTxReceipt(String(tf?.txHash));
        //TODO might be unnecessary why handleTransaction does not do this
        if (!txReceipt.executed)
          setSwapTransaction(
            swap?.id,
            PublishedSwapTransactionStatus.Pending,
            txHash
          );
        else handleTransaction(swap?.id, txReceipt, String(tf?.txHash));
      }
    } catch (e: any) {
      if (e?.message) {
        toast(e.message);
        return;
      }
    }
    setLoading(false);
  }, [syncWallet, swap, depositAddress, source_currency, amount]);

  if (!signer) {
    return <ConnectWalletButton />;
  }

  if (l1Network && chainId !== Number(l1Network.chain_id)) {
    return (
      <ChangeNetworkButton
        chainId={Number(l1Network?.chain_id)}
        network={l1Network?.display_name}
      />
    );
  }

  return (
    <>
      <div className="w-full space-y-5 flex flex-col justify-between h-full ">
        <div className="space-y-4">
          {!syncWallet && (
            <SubmitButton
              isDisabled={loading}
              isSubmitting={loading}
              onClick={handleConnect}
              icon={<Link className="h-5 w-5 ml-2" aria-hidden="true" />}
            >
              Authorize to Send on zkSync
            </SubmitButton>
          )}
          {syncWallet && (
            <SubmitButton
              isDisabled={!!(loading || transferDone)}
              isSubmitting={!!(loading || transferDone)}
              onClick={handleTransfer}
              icon={
                <ArrowLeftRight className="h-5 w-5 ml-2" aria-hidden="true" />
              }
            >
              Transfer
            </SubmitButton>
          )}
        </div>
      </div>
    </>
  );
};
export default ZkSyncWalletWithdrawStep;
