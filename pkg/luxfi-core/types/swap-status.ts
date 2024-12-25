export enum SwapStatus {
  Created = "created",
  UserTransferPending = "user_transfer_pending",
  UserTransferDelayed = "user_transfer_delayed",
  UserDepositPending = "user_deposit_pending",
  BridgeTransferPending = "bridge_transfer_pending",
  Completed = "completed",
  Failed = "failed",
  Expired = "expired",
  Cancelled = "cancelled",
  TeleportProcessPending = "teleport_processing_pending",
  UserPayoutPending = "user_payout_pending",
  PayoutSuccess = "payout_success"
}
export const swapStatusByIndex: { [key: number]: SwapStatus } = {
  "0": SwapStatus.Created,
  "1": SwapStatus.UserTransferPending,
  "2": SwapStatus.UserTransferDelayed,
  "3": SwapStatus.BridgeTransferPending,
  "4": SwapStatus.Completed,
  "5": SwapStatus.Failed,
  "6": SwapStatus.Expired,
  "7": SwapStatus.Cancelled,
};

export enum UtilaTransactionStatus {
  AWAITING_APPROVAL = "AWAITING_APPROVAL",
  AWAITING_POLICY_CHECK = "AWAITING_POLICY_CHECK",
  AWAITING_SIGNATURE = "AWAITING_SIGNATURE",
  SIGNED = "SIGNED",
  AWAITING_PUBLISH = "AWAITING_PUBLISH",
  PUBLISHED = "PUBLISHED",
  MINED = "MINED",
  FAILED = "FAILED",
  DECLINED = "DECLINED",
  REPLACED = "REPLACED",
  CANCELED = "CANCELED",
  DROPPED = "DROPPED",
  CONFIRMED = "CONFIRMED",
  EXPIRED = "EXPIRED"
}

export const utilaTransactionStatusByIndex: { [key: number]: UtilaTransactionStatus } = {
  "1": UtilaTransactionStatus.AWAITING_APPROVAL,
  "2": UtilaTransactionStatus.AWAITING_POLICY_CHECK,
  "3": UtilaTransactionStatus.AWAITING_SIGNATURE,
  "4": UtilaTransactionStatus.SIGNED,
  "5": UtilaTransactionStatus.AWAITING_PUBLISH,
  "6": UtilaTransactionStatus.PUBLISHED,
  "7": UtilaTransactionStatus.MINED,
  "8": UtilaTransactionStatus.FAILED,
  "9": UtilaTransactionStatus.DECLINED,
  "10": UtilaTransactionStatus.REPLACED,
  "11": UtilaTransactionStatus.CANCELED,
  "12": UtilaTransactionStatus.DROPPED,
  "13": UtilaTransactionStatus.CONFIRMED,
  "14": UtilaTransactionStatus.EXPIRED
}
