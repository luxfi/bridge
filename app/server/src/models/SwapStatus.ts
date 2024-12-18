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
export const statusMapping: { [key: number]: SwapStatus } = {
  "0": SwapStatus.Created,
  "1": SwapStatus.UserTransferPending,
  "2": SwapStatus.UserTransferDelayed,
  "3": SwapStatus.BridgeTransferPending,
  "4": SwapStatus.Completed,
  "5": SwapStatus.Failed,
  "6": SwapStatus.Expired,
  "7": SwapStatus.Cancelled,
};

export enum UtilaTransactionState {
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

export const UtilaTransactionStateMapping: { [key: number]: UtilaTransactionState } = {
  "1": UtilaTransactionState.AWAITING_APPROVAL,
  "2": UtilaTransactionState.AWAITING_POLICY_CHECK,
  "3": UtilaTransactionState.AWAITING_SIGNATURE,
  "4": UtilaTransactionState.SIGNED,
  "5": UtilaTransactionState.AWAITING_PUBLISH,
  "6": UtilaTransactionState.PUBLISHED,
  "7": UtilaTransactionState.MINED,
  "8": UtilaTransactionState.FAILED,
  "9": UtilaTransactionState.DECLINED,
  "10": UtilaTransactionState.REPLACED,
  "11": UtilaTransactionState.CANCELED,
  "12": UtilaTransactionState.DROPPED,
  "13": UtilaTransactionState.CONFIRMED,
  "14": UtilaTransactionState.EXPIRED
}
