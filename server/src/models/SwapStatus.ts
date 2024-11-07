export enum SwapStatus {
  Created = "created",
  UserTransferPending = "user_transfer_pending",
  UserDepositPending = "user_deposit_pending",
  UserTransferDelayed = "user_transfer_delayed",
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
