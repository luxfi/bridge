// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1alpha1/api.proto (package utila.api.v1alpha1, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_google_api_annotations } from "../../../google/api/annotations_pb";
import { file_google_api_client } from "../../../google/api/client_pb";
import { file_google_api_field_behavior } from "../../../google/api/field_behavior_pb";
import { file_google_api_resource } from "../../../google/api/resource_pb";
import { file_google_api_visibility } from "../../../google/api/visibility_pb";
import { file_google_protobuf_descriptor, file_google_protobuf_wrappers } from "@bufbuild/protobuf/wkt";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../protoc-gen-openapiv2/options/annotations_pb";
import type { BatchGetTransactionsRequestSchema, BatchGetTransactionsResponseSchema, EVM, EVMFee, GetTransactionRequestSchema, Pagination, Transaction_BTCTransaction, Transaction_EVMMessage, Transaction_EVMTransaction, Transaction_FungibleTokenTransfer, Transaction_NativeMultiTransfer, Transaction_NativeTransfer, Transaction_NonFungibleTokenApproval, Transaction_NonFungibleTokenTransfer, Transaction_Timestamps, Transaction_TokenApproval, UserActivity } from "../v1/api_pb";
import { file_utila_api_v1_api } from "../v1/api_pb";
import type { TransactionState_Enum, TransactionSubType_Enum, TransactionType_Enum } from "../v1/transactions_pb";
import { file_utila_api_v1_transactions } from "../v1/transactions_pb";
import type { EstimateTransactionFeeRequestSchema, EstimateTransactionFeeResponseSchema, InitiateTransactionRequestSchema } from "./transactions_pb";
import { file_utila_api_v1alpha1_transactions } from "./transactions_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1alpha1/api.proto.
 */
export const file_utila_api_v1alpha1_api: GenFile = /*@__PURE__*/
  fileDesc("Chx1dGlsYS9hcGkvdjFhbHBoYTEvYXBpLnByb3RvEhJ1dGlsYS5hcGkudjFhbHBoYTEiYgoXTGlzdFRyYW5zYWN0aW9uc1JlcXVlc3QSGQoIdmF1bHRfaWQY1NS9aSABKAlCBOJBAQISLAoKcGFnaW5hdGlvbhgBIAEoCzIYLnV0aWxhLmFwaS52MS5QYWdpbmF0aW9uImUKGExpc3RUcmFuc2FjdGlvbnNSZXNwb25zZRI1Cgx0cmFuc2FjdGlvbnMYASADKAsyHy51dGlsYS5hcGkudjFhbHBoYTEuVHJhbnNhY3Rpb24SEgoKdG90YWxfc2l6ZRgCIAEoDSLYAQoYQ3JlYXRlVHJhbnNhY3Rpb25SZXF1ZXN0EhkKCHZhdWx0X2lkGNTUvWkgASgJQgTiQQECEjoKC3RyYW5zYWN0aW9uGAEgASgLMh8udXRpbGEuYXBpLnYxYWxwaGExLlRyYW5zYWN0aW9uQgTiQQECEiIKGmRlc2lnbmF0ZV9jYWxsZXJfYXNfc2lnbmVyGAIgASgIEhUKDXZhbGlkYXRlX29ubHkYAyABKAgSEgoKcmVxdWVzdF9pZBgEIAEoCRIWCg5ydW5fc2ltdWxhdGlvbhgFIAEoCCKpBAogQ3JlYXRlVHJhbnNmZXJUcmFuc2FjdGlvblJlcXVlc3QSGQoIdmF1bHRfaWQY1NS9aSABKAlCBOJBAQISHgoQc291cmNlX3dhbGxldF9pZBgBIAEoCUIE4kEBAhJCCgtkZXN0aW5hdGlvbhgCIAEoCzInLnV0aWxhLmFwaS52MWFscGhhMS5UcmFuc2ZlckRlc3RpbmF0aW9uQgTiQQECEkQKBWFzc2V0GAMgASgJQjWSQRdKFSJhc3NldHMvZTcyZmYzNWE1YjE1IuJBAQL6QRQKEmFwaS51dGlsYS5pby9Bc3NldBIyCgZhbW91bnQYBCABKAsyHC5nb29nbGUucHJvdG9idWYuU3RyaW5nVmFsdWVCBOJBAQESEgoEbm90ZRgFIAEoCUIE4kEBARIjChVkZXNpZ25hdGVkX3NpZ25lcl9pZHMYBiADKAlCBOJBAQESIgoaZGVzaWduYXRlX2NhbGxlcl9hc19zaWduZXIYByABKAgSRwoIcHJpb3JpdHkYCCABKA4yLy51dGlsYS5hcGkudjFhbHBoYTEuVHJhbnNhY3Rpb25Qcmlvcml0eUZlZS5FbnVtQgTiQQEBEi0KB2V2bV9mZWUYCiABKAsyFC51dGlsYS5hcGkudjEuRVZNRmVlQgTiQQEBSAASFQoNdmFsaWRhdGVfb25seRgUIAEoCBISCgpyZXF1ZXN0X2lkGBUgASgJQgwKCmN1c3RvbV9mZWUibAoTVHJhbnNmZXJEZXN0aW5hdGlvbhITCgl3YWxsZXRfaWQYASABKAlIABIRCgdhZGRyZXNzGAIgASgJSAASHgoUYWRkcmVzc2Jvb2tfZW50cnlfaWQYAyABKAlIAEINCgtkZXN0aW5hdGlvbiLGEAoLVHJhbnNhY3Rpb24SEAoCaWQYASABKAlCBOJBAQMSGQoLY2hhaW5fdHhfaWQYAiABKAlCBOJBAQMSOAoFc3RhdGUYAyABKA4yIy51dGlsYS5hcGkudjEuVHJhbnNhY3Rpb25TdGF0ZS5FbnVtQgTiQQEDEhoKDGluaXRpYXRvcl9pZBgEIAEoCUIE4kEBAxIdChVkZXNpZ25hdGVkX3NpZ25lcl9pZHMYCiADKAkSEQoJd2FsbGV0X2lkGAUgASgJEhcKD25vX2F1dG9fcHVibGlzaBgGIAEoCBIMCgRub3RlGAcgASgJEhcKCXNpZ25hdHVyZRgIIAEoDEIE4kEBAxISCgRoYXNoGAkgASgMQgTiQQEDEhMKC3JlcGxhY2VzX2lkGBQgASgJElEKDXJlcGxhY2VzX3R5cGUYFSABKA4yNC51dGlsYS5hcGkudjFhbHBoYTEuVHJhbnNhY3Rpb24uUmVwbGFjZW1lbnRUeXBlLkVudW1CBOJBAQMSHAoOcmVwbGFjZWRfYnlfaWQYFiABKAlCBOJBAQMSUQoNcmVwbGFjZWRfdHlwZRgXIAEoDjI0LnV0aWxhLmFwaS52MWFscGhhMS5UcmFuc2FjdGlvbi5SZXBsYWNlbWVudFR5cGUuRW51bUIE4kEBAxJFCgxwcmlvcml0eV9mZWUYGCABKA4yLy51dGlsYS5hcGkudjFhbHBoYTEuVHJhbnNhY3Rpb25Qcmlvcml0eUZlZS5FbnVtEkoKB25ldHdvcmsYGSABKAlCOZJBHUobIm5ldHdvcmtzL2V0aGVyZXVtLW1haW5uZXQi+kEWChRhcGkudXRpbGEuaW8vTmV0d29yaxIuCgtldm1fZGV0YWlscxgaIAEoCzIRLnV0aWxhLmFwaS52MS5FVk1CBOJBAQRIABI2CgR0eXBlGBsgASgOMiIudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uVHlwZS5FbnVtQgTiQQEDEj0KCHN1Yl90eXBlGBwgASgOMiUudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uU3ViVHlwZS5FbnVtQgTiQQEDEkgKEG5hdGl2ZV90cmFuc2ZlcnMYMiADKAsyKC51dGlsYS5hcGkudjEuVHJhbnNhY3Rpb24uTmF0aXZlVHJhbnNmZXJCBOJBAQMSUgoVbmF0aXZlX211bHRpX3RyYW5zZmVyGDMgAygLMi0udXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uLk5hdGl2ZU11bHRpVHJhbnNmZXJCBOJBAQMSVwoYZnVuZ2libGVfdG9rZW5fdHJhbnNmZXJzGDQgAygLMi8udXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uLkZ1bmdpYmxlVG9rZW5UcmFuc2ZlckIE4kEBAxJeChxub25fZnVuZ2libGVfdG9rZW5fdHJhbnNmZXJzGDUgAygLMjIudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uLk5vbkZ1bmdpYmxlVG9rZW5UcmFuc2ZlckIE4kEBAxJFCg50b2tlbl9hcHByb3ZhbBg2IAMoCzInLnV0aWxhLmFwaS52MS5UcmFuc2FjdGlvbi5Ub2tlbkFwcHJvdmFsQgTiQQEDEl0KG25vbl9mdW5naWJsZV90b2tlbl9hcHByb3ZhbBg3IAMoCzIyLnV0aWxhLmFwaS52MS5UcmFuc2FjdGlvbi5Ob25GdW5naWJsZVRva2VuQXBwcm92YWxCBOJBAQMSRwoPZXZtX3RyYW5zYWN0aW9uGDwgASgLMigudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uLkVWTVRyYW5zYWN0aW9uQgTiQQEDEj8KC2V2bV9tZXNzYWdlGD0gASgLMiQudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uLkVWTU1lc3NhZ2VCBOJBAQMSRwoPYnRjX3RyYW5zYWN0aW9uGEYgASgLMigudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uLkJUQ1RyYW5zYWN0aW9uQgTiQQEDEkcKCWRpcmVjdGlvbhhkIAEoDjIuLnV0aWxhLmFwaS52MWFscGhhMS5UcmFuc2FjdGlvbi5EaXJlY3Rpb24uRW51bUIE4kEBAxI+Cgp0aW1lc3RhbXBzGGUgASgLMiQudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uLlRpbWVzdGFtcHNCBOJBAQMSNwoNdXNlcl9hY3Rpdml0eRhmIAEoCzIaLnV0aWxhLmFwaS52MS5Vc2VyQWN0aXZpdHlCBOJBAQMSHwoRbWF0Y2hpbmdfcnVsZV9pZHMYbiADKAlCBOJBAQMSHgoQZGVueWluZ19ydWxlX2lkcxhvIAMoCUIE4kEBAxIfChFhbGxvd2luZ19ydWxlX2lkcxhwIAMoCUIE4kEBAxpACglEaXJlY3Rpb24iMwoERW51bRIPCgtVTlNQRUNJRklFRBAAEgwKCElOQ09NSU5HEAESDAoIT1VUR09JTkcQAhpRCg5Db252ZXJ0ZWRWYWx1ZRIgChhjb252ZXJ0ZWRfdmFsdWVfZXhwZWN0ZWQYASABKAkSHQoVY29udmVydGVkX3ZhbHVlX21pbmVkGAIgASgJGk4KD1JlcGxhY2VtZW50VHlwZSI7CgRFbnVtEg8KC1VOU1BFQ0lGSUVEEAASEAoMQ0FOQ0VMTEFUSU9OEAESEAoMQUNDRUxFUkFUSU9OEAIaNwoFVXRpbGESGwoOZXh0ZW5zaW9uX2luZm8YASABKAlIAIgBAUIRCg9fZXh0ZW5zaW9uX2luZm9CCQoHZGV0YWlscyJcChZUcmFuc2FjdGlvblByaW9yaXR5RmVlIkIKBEVudW0SDwoLVU5TUEVDSUZJRUQQABIHCgNMT1cQARIKCgZOT1JNQUwQAhIICgRISUdIEAMSCgoGQ1VTVE9NEAQy9QYKDFRyYW5zYWN0aW9ucxKjAQoQTGlzdFRyYW5zYWN0aW9ucxIrLnV0aWxhLmFwaS52MWFscGhhMS5MaXN0VHJhbnNhY3Rpb25zUmVxdWVzdBosLnV0aWxhLmFwaS52MWFscGhhMS5MaXN0VHJhbnNhY3Rpb25zUmVzcG9uc2UiNJi1GAGC0+STAioSKC92MWFscGhhMS92YXVsdHMve3ZhdWx0X2lkfS90cmFuc2FjdGlvbnMSkQEKDkdldFRyYW5zYWN0aW9uEiMudXRpbGEuYXBpLnYxLkdldFRyYW5zYWN0aW9uUmVxdWVzdBofLnV0aWxhLmFwaS52MWFscGhhMS5UcmFuc2FjdGlvbiI5mLUYAYLT5JMCLxItL3YxYWxwaGExL3ZhdWx0cy97dmF1bHRfaWR9L3RyYW5zYWN0aW9ucy97aWR9EqwBChRCYXRjaEdldFRyYW5zYWN0aW9ucxIpLnV0aWxhLmFwaS52MS5CYXRjaEdldFRyYW5zYWN0aW9uc1JlcXVlc3QaKi51dGlsYS5hcGkudjEuQmF0Y2hHZXRUcmFuc2FjdGlvbnNSZXNwb25zZSI9mLUYAYLT5JMCMxIxL3YxYWxwaGExL3ZhdWx0cy97dmF1bHRfaWR9L3RyYW5zYWN0aW9uczpiYXRjaEdldBK0AQoTSW5pdGlhdGVUcmFuc2FjdGlvbhIuLnV0aWxhLmFwaS52MWFscGhhMS5Jbml0aWF0ZVRyYW5zYWN0aW9uUmVxdWVzdBofLnV0aWxhLmFwaS52MWFscGhhMS5UcmFuc2FjdGlvbiJMgrUYAggBgrUYAggCmLUYAYLT5JMCNjoBKiIxL3YxYWxwaGExL3twYXJlbnQ9dmF1bHRzLyp9L3RyYW5zYWN0aW9uczppbml0aWF0ZRLEAQoWRXN0aW1hdGVUcmFuc2FjdGlvbkZlZRIxLnV0aWxhLmFwaS52MWFscGhhMS5Fc3RpbWF0ZVRyYW5zYWN0aW9uRmVlUmVxdWVzdBoyLnV0aWxhLmFwaS52MWFscGhhMS5Fc3RpbWF0ZVRyYW5zYWN0aW9uRmVlUmVzcG9uc2UiQ5i1GAGC0+STAjk6ASoiNC92MWFscGhhMS97cGFyZW50PXZhdWx0cy8qfS90cmFuc2FjdGlvbnM6ZXN0aW1hdGVGZWVC0QRaInV0aWxhLmlvL2dlbnByb3RvL2FwaS92MWFscGhhMTthcGmSQakEEpUBCglVdGlsYSBBUEkSflV0aWxhIHByb3ZpZGVzIGEgcm9idXN0IEFQSSBmb3IgZGV2ZWxvcGVycyB0byBwcm9ncmFtbWF0aWNhbGx5IGxldmVyYWdlIFV0aWxhJ3MgY2FwYWJpbGl0aWVzIHdpdGhvdXQgY29tcHJvbWlzaW5nIG9uIHNlY3VyaXR5LjIIdjFhbHBoYTEaDGFwaS51dGlsYS5pbyoBAmpFChJEZXByZWNhdGlvbiBOb3RpY2USL3t7IGltcG9ydCAidXRpbGEvYXBpL3YxYWxwaGExL2RlcHJlY2F0ZWQubWQiIH19akUKDkF1dGhlbnRpY2F0aW9uEjN7eyBpbXBvcnQgInV0aWxhL2FwaS92MWFscGhhMS9hdXRoZW50aWNhdGlvbi5tZCIgfX1qCAoGVmF1bHRzag0KC0Jsb2NrY2hhaW5zaggKBkFzc2V0c2oJCgdXYWxsZXRzagoKCEJhbGFuY2Vzag4KDFRyYW5zYWN0aW9uc2o5CghXZWJob29rcxIte3sgaW1wb3J0ICJ1dGlsYS9hcGkvdjFhbHBoYTEvd2ViaG9va3MubWQiIH19ai8KA0NMSRIoe3sgaW1wb3J0ICJ1dGlsYS9hcGkvdjFhbHBoYTEvY2xpLm1kIiB9fWo6CglDby1TaWduZXISLXt7IGltcG9ydCAidXRpbGEvYXBpL3YxYWxwaGExL2Nvc2lnbmVyLm1kIiB9fWIGcHJvdG8z", [file_google_api_annotations, file_google_api_client, file_google_api_field_behavior, file_google_api_resource, file_google_api_visibility, file_google_protobuf_descriptor, file_google_protobuf_wrappers, file_protoc_gen_openapiv2_options_annotations, file_utila_api_v1_api, file_utila_api_v1_transactions, file_utila_api_v1alpha1_transactions]);

/**
 * @generated from message utila.api.v1alpha1.ListTransactionsRequest
 */
export type ListTransactionsRequest = Message<"utila.api.v1alpha1.ListTransactionsRequest"> & {
  /**
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;

  /**
   * @generated from field: utila.api.v1.Pagination pagination = 1;
   */
  pagination?: Pagination;
};

/**
 * Describes the message utila.api.v1alpha1.ListTransactionsRequest.
 * Use `create(ListTransactionsRequestSchema)` to create a new message.
 */
export const ListTransactionsRequestSchema: GenMessage<ListTransactionsRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 0);

/**
 * @generated from message utila.api.v1alpha1.ListTransactionsResponse
 */
export type ListTransactionsResponse = Message<"utila.api.v1alpha1.ListTransactionsResponse"> & {
  /**
   * @generated from field: repeated utila.api.v1alpha1.Transaction transactions = 1;
   */
  transactions: Transaction[];

  /**
   * Count of matching transactions across all pages.
   *
   * @generated from field: uint32 total_size = 2;
   */
  totalSize: number;
};

/**
 * Describes the message utila.api.v1alpha1.ListTransactionsResponse.
 * Use `create(ListTransactionsResponseSchema)` to create a new message.
 */
export const ListTransactionsResponseSchema: GenMessage<ListTransactionsResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 1);

/**
 * @generated from message utila.api.v1alpha1.CreateTransactionRequest
 */
export type CreateTransactionRequest = Message<"utila.api.v1alpha1.CreateTransactionRequest"> & {
  /**
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;

  /**
   * @generated from field: utila.api.v1alpha1.Transaction transaction = 1;
   */
  transaction?: Transaction;

  /**
   * Set the calling user as the only designated signer of the transaction. Defaults to false.
   * Takes precedence over `transaction.designatedSignerIds`.
   *
   * @generated from field: bool designate_caller_as_signer = 2;
   */
  designateCallerAsSigner: boolean;

  /**
   * Do not actually create the transaction, just validate it against Vault policies.
   *
   * @generated from field: bool validate_only = 3;
   */
  validateOnly: boolean;

  /**
   * A unique identifier for this request. Restricted to 36 ASCII characters.
   * A random UUID is recommended.
   * This request is only idempotent if a `requestId` is provided.
   *
   * @generated from field: string request_id = 4;
   */
  requestId: string;

  /**
   * Run a simulation against a blockchain node to get the estimated execution results of the transaction like balance changes.
   *
   * @generated from field: bool run_simulation = 5;
   */
  runSimulation: boolean;
};

/**
 * Describes the message utila.api.v1alpha1.CreateTransactionRequest.
 * Use `create(CreateTransactionRequestSchema)` to create a new message.
 */
export const CreateTransactionRequestSchema: GenMessage<CreateTransactionRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 2);

/**
 * @generated from message utila.api.v1alpha1.CreateTransferTransactionRequest
 */
export type CreateTransferTransactionRequest = Message<"utila.api.v1alpha1.CreateTransferTransactionRequest"> & {
  /**
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;

  /**
   * @generated from field: string source_wallet_id = 1;
   */
  sourceWalletId: string;

  /**
   * @generated from field: utila.api.v1alpha1.TransferDestination destination = 2;
   */
  destination?: TransferDestination;

  /**
   * Format: `assets/{asset}`
   *
   * @generated from field: string asset = 3;
   */
  asset: string;

  /**
   * In 'regular' units (e.g. eth and not wei). Shouldn't be specified for NFT transfers.
   *
   * @generated from field: google.protobuf.StringValue amount = 4;
   */
  amount?: string;

  /**
   * @generated from field: string note = 5;
   */
  note: string;

  /**
   * User IDs of the designated signers of the transaction.
   * If unspecified, all signing vault members will be able to sign.
   *
   * @generated from field: repeated string designated_signer_ids = 6;
   */
  designatedSignerIds: string[];

  /**
   * Set the calling user as the only designated signer of the transaction. Defaults to false.
   * Takes precedence over `designatedSignerIds`.
   *
   * @generated from field: bool designate_caller_as_signer = 7;
   */
  designateCallerAsSigner: boolean;

  /**
   * Priority fee level for this transaction.
   *
   * @generated from field: utila.api.v1alpha1.TransactionPriorityFee.Enum priority = 8;
   */
  priority: TransactionPriorityFee_Enum;

  /**
   * Required only if priority is set to CUSTOM.
   *
   * @generated from oneof utila.api.v1alpha1.CreateTransferTransactionRequest.custom_fee
   */
  customFee: {
    /**
     * @generated from field: utila.api.v1.EVMFee evm_fee = 10;
     */
    value: EVMFee;
    case: "evmFee";
  } | { case: undefined; value?: undefined };

  /**
   * Do not actually create the transaction, just validate it against Vault policies.
   *
   * @generated from field: bool validate_only = 20;
   */
  validateOnly: boolean;

  /**
   * A unique identifier for this request. Restricted to 36 ASCII characters.
   * A random UUID is recommended.
   * This request is only idempotent if a `requestId` is provided.
   *
   * @generated from field: string request_id = 21;
   */
  requestId: string;
};

/**
 * Describes the message utila.api.v1alpha1.CreateTransferTransactionRequest.
 * Use `create(CreateTransferTransactionRequestSchema)` to create a new message.
 */
export const CreateTransferTransactionRequestSchema: GenMessage<CreateTransferTransactionRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 3);

/**
 * @generated from message utila.api.v1alpha1.TransferDestination
 */
export type TransferDestination = Message<"utila.api.v1alpha1.TransferDestination"> & {
  /**
   * @generated from oneof utila.api.v1alpha1.TransferDestination.destination
   */
  destination: {
    /**
     * @generated from field: string wallet_id = 1;
     */
    value: string;
    case: "walletId";
  } | {
    /**
     * @generated from field: string address = 2;
     */
    value: string;
    case: "address";
  } | {
    /**
     * @generated from field: string addressbook_entry_id = 3;
     */
    value: string;
    case: "addressbookEntryId";
  } | { case: undefined; value?: undefined };
};

/**
 * Describes the message utila.api.v1alpha1.TransferDestination.
 * Use `create(TransferDestinationSchema)` to create a new message.
 */
export const TransferDestinationSchema: GenMessage<TransferDestination> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 4);

/**
 * @generated from message utila.api.v1alpha1.Transaction
 */
export type Transaction = Message<"utila.api.v1alpha1.Transaction"> & {
  /**
   * @generated from field: string id = 1;
   */
  id: string;

  /**
   * @generated from field: string chain_tx_id = 2;
   */
  chainTxId: string;

  /**
   * @generated from field: utila.api.v1.TransactionState.Enum state = 3;
   */
  state: TransactionState_Enum;

  /**
   * @generated from field: string initiator_id = 4;
   */
  initiatorId: string;

  /**
   * @generated from field: repeated string designated_signer_ids = 10;
   */
  designatedSignerIds: string[];

  /**
   * @generated from field: string wallet_id = 5;
   */
  walletId: string;

  /**
   * @generated from field: bool no_auto_publish = 6;
   */
  noAutoPublish: boolean;

  /**
   * @generated from field: string note = 7;
   */
  note: string;

  /**
   * @generated from field: bytes signature = 8;
   */
  signature: Uint8Array;

  /**
   * @generated from field: bytes hash = 9;
   */
  hash: Uint8Array;

  /**
   * @generated from field: string replaces_id = 20;
   */
  replacesId: string;

  /**
   * Used only when replaces_id is populated. Indicates why this transaction
   * replaces another.
   *
   * @generated from field: utila.api.v1alpha1.Transaction.ReplacementType.Enum replaces_type = 21;
   */
  replacesType: Transaction_ReplacementType_Enum;

  /**
   * @generated from field: string replaced_by_id = 22;
   */
  replacedById: string;

  /**
   * Used only when replaced_by_id is populated. Indicates why this transaction
   * is replaced.
   *
   * @generated from field: utila.api.v1alpha1.Transaction.ReplacementType.Enum replaced_type = 23;
   */
  replacedType: Transaction_ReplacementType_Enum;

  /**
   * @generated from field: utila.api.v1alpha1.TransactionPriorityFee.Enum priority_fee = 24;
   */
  priorityFee: TransactionPriorityFee_Enum;

  /**
   * Format: `networks/{network}`
   *
   * @generated from field: string network = 25;
   */
  network: string;

  /**
   * @generated from oneof utila.api.v1alpha1.Transaction.details
   */
  details: {
    /**
     * @generated from field: utila.api.v1.EVM evm_details = 26;
     */
    value: EVM;
    case: "evmDetails";
  } | { case: undefined; value?: undefined };

  /**
   * @generated from field: utila.api.v1.TransactionType.Enum type = 27;
   */
  type: TransactionType_Enum;

  /**
   * @generated from field: utila.api.v1.TransactionSubType.Enum sub_type = 28;
   */
  subType: TransactionSubType_Enum;

  /**
   * @generated from field: repeated utila.api.v1.Transaction.NativeTransfer native_transfers = 50;
   */
  nativeTransfers: Transaction_NativeTransfer[];

  /**
   * @generated from field: repeated utila.api.v1.Transaction.NativeMultiTransfer native_multi_transfer = 51;
   */
  nativeMultiTransfer: Transaction_NativeMultiTransfer[];

  /**
   * @generated from field: repeated utila.api.v1.Transaction.FungibleTokenTransfer fungible_token_transfers = 52;
   */
  fungibleTokenTransfers: Transaction_FungibleTokenTransfer[];

  /**
   * @generated from field: repeated utila.api.v1.Transaction.NonFungibleTokenTransfer non_fungible_token_transfers = 53;
   */
  nonFungibleTokenTransfers: Transaction_NonFungibleTokenTransfer[];

  /**
   * @generated from field: repeated utila.api.v1.Transaction.TokenApproval token_approval = 54;
   */
  tokenApproval: Transaction_TokenApproval[];

  /**
   * @generated from field: repeated utila.api.v1.Transaction.NonFungibleTokenApproval non_fungible_token_approval = 55;
   */
  nonFungibleTokenApproval: Transaction_NonFungibleTokenApproval[];

  /**
   * @generated from field: utila.api.v1.Transaction.EVMTransaction evm_transaction = 60;
   */
  evmTransaction?: Transaction_EVMTransaction;

  /**
   * @generated from field: utila.api.v1.Transaction.EVMMessage evm_message = 61;
   */
  evmMessage?: Transaction_EVMMessage;

  /**
   * @generated from field: utila.api.v1.Transaction.BTCTransaction btc_transaction = 70;
   */
  btcTransaction?: Transaction_BTCTransaction;

  /**
   * @generated from field: utila.api.v1alpha1.Transaction.Direction.Enum direction = 100;
   */
  direction: Transaction_Direction_Enum;

  /**
   * @generated from field: utila.api.v1.Transaction.Timestamps timestamps = 101;
   */
  timestamps?: Transaction_Timestamps;

  /**
   * @generated from field: utila.api.v1.UserActivity user_activity = 102;
   */
  userActivity?: UserActivity;

  /**
   * Rules that matched this transaction. (for limit-based rules it may not be included in deny/allow lists).
   *
   * @generated from field: repeated string matching_rule_ids = 110;
   */
  matchingRuleIds: string[];

  /**
   * If this transaction was denied, the rules that denied it.
   *
   * @generated from field: repeated string denying_rule_ids = 111;
   */
  denyingRuleIds: string[];

  /**
   * If this transaction was allowed, the rules that allowed it.
   *
   * @generated from field: repeated string allowing_rule_ids = 112;
   */
  allowingRuleIds: string[];
};

/**
 * Describes the message utila.api.v1alpha1.Transaction.
 * Use `create(TransactionSchema)` to create a new message.
 */
export const TransactionSchema: GenMessage<Transaction> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 5);

/**
 * @generated from message utila.api.v1alpha1.Transaction.Direction
 */
export type Transaction_Direction = Message<"utila.api.v1alpha1.Transaction.Direction"> & {
};

/**
 * Describes the message utila.api.v1alpha1.Transaction.Direction.
 * Use `create(Transaction_DirectionSchema)` to create a new message.
 */
export const Transaction_DirectionSchema: GenMessage<Transaction_Direction> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 5, 0);

/**
 * @generated from enum utila.api.v1alpha1.Transaction.Direction.Enum
 */
export enum Transaction_Direction_Enum {
  /**
   * @generated from enum value: UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: INCOMING = 1;
   */
  INCOMING = 1,

  /**
   * @generated from enum value: OUTGOING = 2;
   */
  OUTGOING = 2,
}

/**
 * Describes the enum utila.api.v1alpha1.Transaction.Direction.Enum.
 */
export const Transaction_Direction_EnumSchema: GenEnum<Transaction_Direction_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_api, 5, 0, 0);

/**
 * @generated from message utila.api.v1alpha1.Transaction.ConvertedValue
 */
export type Transaction_ConvertedValue = Message<"utila.api.v1alpha1.Transaction.ConvertedValue"> & {
  /**
   * @generated from field: string converted_value_expected = 1;
   */
  convertedValueExpected: string;

  /**
   * @generated from field: string converted_value_mined = 2;
   */
  convertedValueMined: string;
};

/**
 * Describes the message utila.api.v1alpha1.Transaction.ConvertedValue.
 * Use `create(Transaction_ConvertedValueSchema)` to create a new message.
 */
export const Transaction_ConvertedValueSchema: GenMessage<Transaction_ConvertedValue> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 5, 1);

/**
 * @generated from message utila.api.v1alpha1.Transaction.ReplacementType
 */
export type Transaction_ReplacementType = Message<"utila.api.v1alpha1.Transaction.ReplacementType"> & {
};

/**
 * Describes the message utila.api.v1alpha1.Transaction.ReplacementType.
 * Use `create(Transaction_ReplacementTypeSchema)` to create a new message.
 */
export const Transaction_ReplacementTypeSchema: GenMessage<Transaction_ReplacementType> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 5, 2);

/**
 * @generated from enum utila.api.v1alpha1.Transaction.ReplacementType.Enum
 */
export enum Transaction_ReplacementType_Enum {
  /**
   * @generated from enum value: UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: CANCELLATION = 1;
   */
  CANCELLATION = 1,

  /**
   * @generated from enum value: ACCELERATION = 2;
   */
  ACCELERATION = 2,
}

/**
 * Describes the enum utila.api.v1alpha1.Transaction.ReplacementType.Enum.
 */
export const Transaction_ReplacementType_EnumSchema: GenEnum<Transaction_ReplacementType_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_api, 5, 2, 0);

/**
 * A message for internal use only. This field is not visible to the client.
 *
 * @generated from message utila.api.v1alpha1.Transaction.Utila
 */
export type Transaction_Utila = Message<"utila.api.v1alpha1.Transaction.Utila"> & {
  /**
   * DApp information for internal use.
   *
   * @generated from field: optional string extension_info = 1;
   */
  extensionInfo?: string;
};

/**
 * Describes the message utila.api.v1alpha1.Transaction.Utila.
 * Use `create(Transaction_UtilaSchema)` to create a new message.
 */
export const Transaction_UtilaSchema: GenMessage<Transaction_Utila> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 5, 3);

/**
 * @generated from message utila.api.v1alpha1.TransactionPriorityFee
 */
export type TransactionPriorityFee = Message<"utila.api.v1alpha1.TransactionPriorityFee"> & {
};

/**
 * Describes the message utila.api.v1alpha1.TransactionPriorityFee.
 * Use `create(TransactionPriorityFeeSchema)` to create a new message.
 */
export const TransactionPriorityFeeSchema: GenMessage<TransactionPriorityFee> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_api, 6);

/**
 * @generated from enum utila.api.v1alpha1.TransactionPriorityFee.Enum
 */
export enum TransactionPriorityFee_Enum {
  /**
   * @generated from enum value: UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: LOW = 1;
   */
  LOW = 1,

  /**
   * @generated from enum value: NORMAL = 2;
   */
  NORMAL = 2,

  /**
   * @generated from enum value: HIGH = 3;
   */
  HIGH = 3,

  /**
   * @generated from enum value: CUSTOM = 4;
   */
  CUSTOM = 4,
}

/**
 * Describes the enum utila.api.v1alpha1.TransactionPriorityFee.Enum.
 */
export const TransactionPriorityFee_EnumSchema: GenEnum<TransactionPriorityFee_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_api, 6, 0);

/**
 * @generated from service utila.api.v1alpha1.Transactions
 */
export const Transactions: GenService<{
  /**
   * ListTransactions
   *
   * Retrieves transactions. Response is paginated.
   *
   * @generated from rpc utila.api.v1alpha1.Transactions.ListTransactions
   */
  listTransactions: {
    methodKind: "unary";
    input: typeof ListTransactionsRequestSchema;
    output: typeof ListTransactionsResponseSchema;
  },
  /**
   * GetTransaction
   *
   * Retrieves a transaction by its Utila ID.
   *
   * @generated from rpc utila.api.v1alpha1.Transactions.GetTransaction
   */
  getTransaction: {
    methodKind: "unary";
    input: typeof GetTransactionRequestSchema;
    output: typeof TransactionSchema;
  },
  /**
   * BatchGetTransactions
   *
   * Retrieves multiple transactions by their Utila IDs.
   *
   * @generated from rpc utila.api.v1alpha1.Transactions.BatchGetTransactions
   */
  batchGetTransactions: {
    methodKind: "unary";
    input: typeof BatchGetTransactionsRequestSchema;
    output: typeof BatchGetTransactionsResponseSchema;
  },
  /**
   * CreateTransaction
   *
   * Creates a Blockchain transaction with the specified chain-specific
   * information.
   *
   * @generated from rpc utila.api.v1alpha1.Transactions.InitiateTransaction
   */
  initiateTransaction: {
    methodKind: "unary";
    input: typeof InitiateTransactionRequestSchema;
    output: typeof TransactionSchema;
  },
  /**
   * CreateTransferTransaction
   *
   * Creates a Blockchain transaction with the specified information.
   *
   * @generated from rpc utila.api.v1alpha1.Transactions.EstimateTransactionFee
   */
  estimateTransactionFee: {
    methodKind: "unary";
    input: typeof EstimateTransactionFeeRequestSchema;
    output: typeof EstimateTransactionFeeResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_utila_api_v1alpha1_api, 0);
