"use client";
import { type FC } from "react";
import Widget from "../Widget";
import { useSwapDataState } from "../../context/swap";
import Withdraw from "./Withdraw";
import Processing from "./Withdraw/Processing";
import {
  PublishedSwapTransactionStatus,
  TransactionType,
} from "../../lib/BridgeApiClient";
import { SwapStatus } from "../../Models/SwapStatus";
import GasDetails from "../gasDetails";
import { useSettings } from "../../context/settings";

type Props = {
  type: "widget" | "contained";
};
import { useSwapTransactionStore } from "../../stores/swapTransactionStore";

const SwapDetails: FC<Props> = ({ type }) => {
  const { swap } = useSwapDataState();
  const settings = useSettings();
  const swapStatus = swap?.status;
  const storedWalletTransactions = useSwapTransactionStore();

  const swapInputTransaction = swap?.transactions?.find(
    (t) => t.type === TransactionType.Input
  );
  const storedWalletTransaction =
    storedWalletTransactions.swapTransactions?.[swap?.id || ""];

  const sourceNetwork = settings.layers.find(
    (l) => l.internal_name === swap?.source_network
  );
  const currency = sourceNetwork?.assets.find(
    (c) => c.asset === swap?.source_asset
  );

  if (!swap) {
    return (
      <div className="w-full h-[430px]">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-6 py-1">
            <div className="h-32 bg-level-1 rounded-lg"></div>
            <div className="h-40 bg-level-1 rounded-lg"></div>
            <div className="h-12 bg-level-1 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  } else {
    return (
      <>
        <Container type={type}>
          {swapStatus === SwapStatus.UserTransferPending &&
          !(
            swapInputTransaction ||
            (storedWalletTransaction &&
              storedWalletTransaction.status !==
                PublishedSwapTransactionStatus.Error)
          ) ? (
            <Withdraw />
          ) : (
            <Processing />
          )}
        </Container>
        {process.env.NEXT_PUBLIC_SHOW_GAS_DETAILS === "true" &&
          sourceNetwork &&
          currency && (
            <GasDetails network={sourceNetwork} currency={currency} />
          )}
      </>
    );
  }
};

const Container = ({
  type,
  children,
}: Props & {
  children: JSX.Element | JSX.Element[];
}) => {
  if (type === "widget")
    return (
      <Widget>
        <>{children}</>
      </Widget>
    );
  else
    return (
      <div className="w-full flex flex-col justify-between h-full space-y-2">
        {children}
      </div>
    );
};

export default SwapDetails;
