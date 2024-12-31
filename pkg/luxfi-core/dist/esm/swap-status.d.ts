export declare enum SwapStatus {
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
export declare const swapStatusByIndex: {
    [key: number]: SwapStatus;
};
export declare enum UtilaTransactionStatus {
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
export declare const utilaTransactionStatusByIndex: {
    [key: number]: UtilaTransactionStatus;
};
//# sourceMappingURL=swap-status.d.ts.map