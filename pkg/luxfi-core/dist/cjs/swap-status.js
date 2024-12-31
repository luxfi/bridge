"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.utilaTransactionStatusByIndex = exports.UtilaTransactionStatus = exports.swapStatusByIndex = exports.SwapStatus = void 0;
var SwapStatus;
(function (SwapStatus) {
    SwapStatus["Created"] = "created";
    SwapStatus["UserTransferPending"] = "user_transfer_pending";
    SwapStatus["UserTransferDelayed"] = "user_transfer_delayed";
    SwapStatus["UserDepositPending"] = "user_deposit_pending";
    SwapStatus["BridgeTransferPending"] = "bridge_transfer_pending";
    SwapStatus["Completed"] = "completed";
    SwapStatus["Failed"] = "failed";
    SwapStatus["Expired"] = "expired";
    SwapStatus["Cancelled"] = "cancelled";
    SwapStatus["TeleportProcessPending"] = "teleport_processing_pending";
    SwapStatus["UserPayoutPending"] = "user_payout_pending";
    SwapStatus["PayoutSuccess"] = "payout_success";
})(SwapStatus || (exports.SwapStatus = SwapStatus = {}));
exports.swapStatusByIndex = {
    "0": SwapStatus.Created,
    "1": SwapStatus.UserTransferPending,
    "2": SwapStatus.UserTransferDelayed,
    "3": SwapStatus.BridgeTransferPending,
    "4": SwapStatus.Completed,
    "5": SwapStatus.Failed,
    "6": SwapStatus.Expired,
    "7": SwapStatus.Cancelled,
};
var UtilaTransactionStatus;
(function (UtilaTransactionStatus) {
    UtilaTransactionStatus["AWAITING_APPROVAL"] = "AWAITING_APPROVAL";
    UtilaTransactionStatus["AWAITING_POLICY_CHECK"] = "AWAITING_POLICY_CHECK";
    UtilaTransactionStatus["AWAITING_SIGNATURE"] = "AWAITING_SIGNATURE";
    UtilaTransactionStatus["SIGNED"] = "SIGNED";
    UtilaTransactionStatus["AWAITING_PUBLISH"] = "AWAITING_PUBLISH";
    UtilaTransactionStatus["PUBLISHED"] = "PUBLISHED";
    UtilaTransactionStatus["MINED"] = "MINED";
    UtilaTransactionStatus["FAILED"] = "FAILED";
    UtilaTransactionStatus["DECLINED"] = "DECLINED";
    UtilaTransactionStatus["REPLACED"] = "REPLACED";
    UtilaTransactionStatus["CANCELED"] = "CANCELED";
    UtilaTransactionStatus["DROPPED"] = "DROPPED";
    UtilaTransactionStatus["CONFIRMED"] = "CONFIRMED";
    UtilaTransactionStatus["EXPIRED"] = "EXPIRED";
})(UtilaTransactionStatus || (exports.UtilaTransactionStatus = UtilaTransactionStatus = {}));
exports.utilaTransactionStatusByIndex = {
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
};
