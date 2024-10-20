import { SwapStatus } from "../../Models/SwapStatus";
import {
  type PublishedSwapTransactions,
  type SwapItem,
  TransactionType,
} from "../../lib/BridgeApiClient";

export default function StatusIcon({
  swap,
  short,
}: {
  swap: SwapItem;
  short?: boolean;
}) {
  const status = swap.status;
  switch (status) {
    case SwapStatus.Failed:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <RedIcon />
            {!short && <p>Failed</p>}
          </div>
        </>
      );
    case SwapStatus.Completed:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <GreenIcon />
            {!short && <p>Completed</p>}
          </div>
        </>
      );
    case SwapStatus.PayoutSuccess:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <GreenIcon />
            {!short && <p>Completed</p>}
          </div>
        </>
      );
    case SwapStatus.Cancelled:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <GreyIcon />
            {!short && <p>Cancelled</p>}
          </div>
        </>
      );
    case SwapStatus.Expired:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <GreyIcon />
            {!short && <p>Expired</p>}
          </div>
        </>
      );
    case SwapStatus.UserTransferPending:
      const data: PublishedSwapTransactions = JSON.parse(
        localStorage.getItem("swapTransactions") || "{}"
      );
      const txForSwap = data.state?.swapTransactions?.[swap.id];
      if (
        txForSwap ||
        swap.transactions.find((t) => t.type === TransactionType.Input)
      ) {
        return (
          <>
            <div className="inline-flex items-center space-x-1">
              <PurpleIcon />
              {!short && <p>Processing</p>}
            </div>
          </>
        );
      } else {
        return (
          <>
            <div className="inline-flex items-center space-x-1">
              <YellowIcon />
              {!short && <p>Pending</p>}
            </div>
          </>
        );
      }
    case SwapStatus.BridgeTransferPending:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <PurpleIcon />
            {!short && <p>Processing</p>}
          </div>
        </>
      );
    case SwapStatus.TeleportProcessPending:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <PurpleIcon />
            {!short && <p>Processing</p>}
          </div>
        </>
      );
    case SwapStatus.UserPayoutPending:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <PurpleIcon />
            {!short && <p>Processing</p>}
          </div>
        </>
      );
    case SwapStatus.UserTransferDelayed:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <YellowIcon />
            {!short && <p>Delayed</p>}
          </div>
        </>
      );
    case SwapStatus.Created:
      return (
        <>
          <div className="inline-flex items-center space-x-1">
            <YellowIcon />
            {!short && <p>Created</p>}
          </div>
        </>
      );
    default:
      return <></>;
  }
}

export const RedIcon = () => {
  return (
    <div className="bg-[#E43636]/20 flex-none rounded-full p-1">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="mr-1.5 w-2 h-2"
        viewBox="0 0 60 60"
        fill="none"
      >
        <circle cx="30" cy="30" r="30" fill="#E43636" />
      </svg>
    </div>
  );
};

export const GreenIcon = () => {
  return (
    <div className="bg-[#55B585]/20 flex-none rounded-full p-1">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-2 h-2"
        viewBox="0 0 60 60"
        fill="none"
      >
        <circle cx="30" cy="30" r="30" fill="#55B585" />
      </svg>
    </div>
  );
};

export const YellowIcon = () => {
  return (
    <div className="bg-[#facc15]/20 flex-none rounded-full p-1">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-2 h-2 lg:h-2 lg:w-2"
        viewBox="0 0 60 60"
        fill="none"
      >
        <circle cx="30" cy="30" r="30" fill="#facc15" />
      </svg>
    </div>
  );
};

export const GreyIcon = () => {
  return (
    <div className="bg-[#808080]/20 flex-none rounded-full p-1">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-2 h-2 lg:h-2 lg:w-2"
        viewBox="0 0 60 60"
        fill="none"
      >
        <circle cx="30" cy="30" r="30" fill="#808080" />
      </svg>
    </div>
  );
};

export const PurpleIcon = () => {
  return (
    <div className="bg-[#A020F0]/20 flex-none rounded-full p-1">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-2 h-2 lg:h-2 lg:w-2"
        viewBox="0 0 60 60"
        fill="none"
      >
        <circle cx="30" cy="30" r="30" fill="#A020F0" />
      </svg>
    </div>
  );
};
