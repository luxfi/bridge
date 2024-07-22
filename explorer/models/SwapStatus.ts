export enum SwapStatus {
  Created = "created",

  UserTransferPending = "user_transfer_pending",
  UserTransferDelayed = "user_transfer_delayed",
  LsTransferPending = "user_transfer_pending",

  Completed = "completed",
  Failed = "failed",
  Expired = "expired",
  Cancelled = "cancelled",
}
