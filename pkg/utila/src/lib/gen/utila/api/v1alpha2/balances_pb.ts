// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1alpha2/balances.proto (package utila.api.v1alpha2, syntax proto3)
/* eslint-disable */

import type { GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_google_api_annotations } from "../../../google/api/annotations_pb";
import { file_google_api_client } from "../../../google/api/client_pb";
import { file_google_api_field_behavior } from "../../../google/api/field_behavior_pb";
import { file_google_api_resource } from "../../../google/api/resource_pb";
import { file_google_api_visibility } from "../../../google/api/visibility_pb";
import { file_google_protobuf_descriptor } from "@bufbuild/protobuf/wkt";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../protoc-gen-openapiv2/options/annotations_pb";
import { file_utila_api_v1_api } from "../v1/api_pb";
import type { ReferencedResource } from "./resources_pb";
import { file_utila_api_v1alpha2_resources } from "./resources_pb";
import type { ConvertedValue } from "./types_pb";
import { file_utila_api_v1alpha2_types } from "./types_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1alpha2/balances.proto.
 */
export const file_utila_api_v1alpha2_balances: GenFile = /*@__PURE__*/
  fileDesc("CiF1dGlsYS9hcGkvdjFhbHBoYTIvYmFsYW5jZXMucHJvdG8SEnV0aWxhLmFwaS52MWFscGhhMiLQAQoUUXVlcnlCYWxhbmNlc1JlcXVlc3QSQwoGcGFyZW50GAEgASgJQjOSQRXKPhL6Ag9wYXJlbnQ9dmF1bHRzLyriQQEC+kEUChJhcGkudXRpbGEuaW8vVmF1bHQSFAoGZmlsdGVyGAIgASgJQgTiQQEBEhcKCXBhZ2Vfc2l6ZRgFIAEoBUIE4kEBARIYCgpwYWdlX3Rva2VuGAYgASgJQgTiQQEBEioKHGluY2x1ZGVfcmVmZXJlbmNlZF9yZXNvdXJjZXMYByABKAhCBOJBAQEiugIKFVF1ZXJ5QmFsYW5jZXNSZXNwb25zZRItCghiYWxhbmNlcxgBIAMoCzIbLnV0aWxhLmFwaS52MWFscGhhMi5CYWxhbmNlEhcKD25leHRfcGFnZV90b2tlbhgCIAEoCRISCgp0b3RhbF9zaXplGAMgASgFEmEKFHJlZmVyZW5jZWRfcmVzb3VyY2VzGOkHIAMoCzJCLnV0aWxhLmFwaS52MWFscGhhMi5RdWVyeUJhbGFuY2VzUmVzcG9uc2UuUmVmZXJlbmNlZFJlc291cmNlc0VudHJ5GmIKGFJlZmVyZW5jZWRSZXNvdXJjZXNFbnRyeRILCgNrZXkYASABKAkSNQoFdmFsdWUYAiABKAsyJi51dGlsYS5hcGkudjFhbHBoYTIuUmVmZXJlbmNlZFJlc291cmNlOgI4ASLTAQoHQmFsYW5jZRJLCgVhc3NldBgCIAEoCUI8kkEiSiAiYXNzZXRzL25hdGl2ZS5ldGhlcmV1bS1tYWlubmV0IvpBFAoSYXBpLnV0aWxhLmlvL0Fzc2V0EhkKBXZhbHVlGAMgASgJQgqSQQdKBSIxLjMiEiIKCXJhd192YWx1ZRgEIAEoCUIPkkEMSgoiMTMwMDAwMDAiGjwKBVV0aWxhEhQKDHdhbGxldF9jb3VudBgBIAEoBRIdChVleHRlcm5hbF93YWxsZXRfY291bnQYAiABKAUi4QEKGlF1ZXJ5V2FsbGV0QmFsYW5jZXNSZXF1ZXN0Ek4KBnBhcmVudBgBIAEoCUI+kkEfyj4c+gIZcGFyZW50PXZhdWx0cy8qL3dhbGxldHMvKuJBAQL6QRUKE2FwaS51dGlsYS5pby9XYWxsZXQSFAoGZmlsdGVyGAIgASgJQgTiQQEBEhcKCXBhZ2Vfc2l6ZRgFIAEoBUIE4kEBARIYCgpwYWdlX3Rva2VuGAYgASgJQgTiQQEBEioKHGluY2x1ZGVfcmVmZXJlbmNlZF9yZXNvdXJjZXMYByABKAhCBOJBAQEi0wIKG1F1ZXJ5V2FsbGV0QmFsYW5jZXNSZXNwb25zZRI6Cg93YWxsZXRfYmFsYW5jZXMYASADKAsyIS51dGlsYS5hcGkudjFhbHBoYTIuV2FsbGV0QmFsYW5jZRIXCg9uZXh0X3BhZ2VfdG9rZW4YAiABKAkSEgoKdG90YWxfc2l6ZRgDIAEoBRJnChRyZWZlcmVuY2VkX3Jlc291cmNlcxjpByADKAsySC51dGlsYS5hcGkudjFhbHBoYTIuUXVlcnlXYWxsZXRCYWxhbmNlc1Jlc3BvbnNlLlJlZmVyZW5jZWRSZXNvdXJjZXNFbnRyeRpiChhSZWZlcmVuY2VkUmVzb3VyY2VzRW50cnkSCwoDa2V5GAEgASgJEjUKBXZhbHVlGAIgASgLMiYudXRpbGEuYXBpLnYxYWxwaGEyLlJlZmVyZW5jZWRSZXNvdXJjZToCOAEi8gEKDVdhbGxldEJhbGFuY2USSwoFYXNzZXQYAiABKAlCPJJBIkogImFzc2V0cy9uYXRpdmUuZXRoZXJldW0tbWFpbm5ldCL6QRQKEmFwaS51dGlsYS5pby9Bc3NldBJVCgZ3YWxsZXQYAyABKAlCRZJBKkooInZhdWx0cy8xYjI1NjM1YTViM2Yvd2FsbGV0cy8yMDM4MDlkZWYyIvpBFQoTYXBpLnV0aWxhLmlvL1dhbGxldBIZCgV2YWx1ZRgEIAEoCUIKkkEHSgUiMS4zIhIiCglyYXdfdmFsdWUYBSABKAlCD5JBDEoKIjEzMDAwMDAwIiL7AQohUXVlcnlXYWxsZXRBZGRyZXNzQmFsYW5jZXNSZXF1ZXN0EmEKBnBhcmVudBgBIAEoCUJRkkEryj4o+gIlcGFyZW50PXZhdWx0cy8qL3dhbGxldHMvKi9hZGRyZXNzZXMvKuJBAQL6QRwKGmFwaS51dGlsYS5pby9XYWxsZXRBZGRyZXNzEhQKBmZpbHRlchgCIAEoCUIE4kEBARIXCglwYWdlX3NpemUYBSABKAVCBOJBAQESGAoKcGFnZV90b2tlbhgGIAEoCUIE4kEBARIqChxpbmNsdWRlX3JlZmVyZW5jZWRfcmVzb3VyY2VzGAcgASgIQgTiQQEBIvACCiJRdWVyeVdhbGxldEFkZHJlc3NCYWxhbmNlc1Jlc3BvbnNlEkkKF3dhbGxldF9hZGRyZXNzX2JhbGFuY2VzGAEgAygLMigudXRpbGEuYXBpLnYxYWxwaGEyLldhbGxldEFkZHJlc3NCYWxhbmNlEhcKD25leHRfcGFnZV90b2tlbhgCIAEoCRISCgp0b3RhbF9zaXplGAMgASgFEm4KFHJlZmVyZW5jZWRfcmVzb3VyY2VzGOkHIAMoCzJPLnV0aWxhLmFwaS52MWFscGhhMi5RdWVyeVdhbGxldEFkZHJlc3NCYWxhbmNlc1Jlc3BvbnNlLlJlZmVyZW5jZWRSZXNvdXJjZXNFbnRyeRpiChhSZWZlcmVuY2VkUmVzb3VyY2VzRW50cnkSCwoDa2V5GAEgASgJEjUKBXZhbHVlGAIgASgLMiYudXRpbGEuYXBpLnYxYWxwaGEyLlJlZmVyZW5jZWRSZXNvdXJjZToCOAEinwIKFFdhbGxldEFkZHJlc3NCYWxhbmNlEksKBWFzc2V0GAEgASgJQjySQSJKICJhc3NldHMvbmF0aXZlLmV0aGVyZXVtLW1haW5uZXQi+kEUChJhcGkudXRpbGEuaW8vQXNzZXQSewoOd2FsbGV0X2FkZHJlc3MYAiABKAlCY5JBQUo/InZhdWx0cy8xYjI1NjM1YTViM2Yvd2FsbGV0cy8yMDM4MDlkZWYyL2FkZHJlc3Nlcy81MTljNjdkZGFlMzMi+kEcChphcGkudXRpbGEuaW8vV2FsbGV0QWRkcmVzcxIZCgV2YWx1ZRgDIAEoCUIKkkEHSgUiMS4zIhIiCglyYXdfdmFsdWUYBCABKAlCD5JBDEoKIjEzMDAwMDAwIiJ7ChJTdW1CYWxhbmNlc1JlcXVlc3QSQwoGcGFyZW50GAEgASgJQjOSQRXKPhL6Ag9wYXJlbnQ9dmF1bHRzLyriQQEC+kEUChJhcGkudXRpbGEuaW8vVmF1bHQSIAoSd2FsbGV0c19zdW1fZmlsdGVyGAIgASgJQgTiQQEBIskBChNTdW1CYWxhbmNlc1Jlc3BvbnNlEjcKC3dhbGxldHNfc3VtGAEgASgLMiIudXRpbGEuYXBpLnYxYWxwaGEyLkNvbnZlcnRlZFZhbHVlEjkKDWV4Y2hhbmdlc19zdW0YAiABKAsyIi51dGlsYS5hcGkudjFhbHBoYTIuQ29udmVydGVkVmFsdWUSPgoSZGVmaV9wb3NpdGlvbnNfc3VtGAMgASgLMiIudXRpbGEuYXBpLnYxYWxwaGEyLkNvbnZlcnRlZFZhbHVlIvEBCiFSZWZyZXNoQXNzZXRBZGRyZXNzQmFsYW5jZVJlcXVlc3QSQwoGcGFyZW50GAEgASgJQjOSQRXKPhL6Ag9wYXJlbnQ9dmF1bHRzLyriQQEC+kEUChJhcGkudXRpbGEuaW8vVmF1bHQSRAoFYXNzZXQYAiABKAlCNZJBF0oVImFzc2V0cy9lNzJmZjM1YTViMTUi4kEBAvpBFAoSYXBpLnV0aWxhLmlvL0Fzc2V0EhUKB2FkZHJlc3MYAyABKAlCBOJBAQISKgocaW5jbHVkZV9yZWZlcmVuY2VkX3Jlc291cmNlcxgEIAEoCEIE4kEBASKmAgoiUmVmcmVzaEFzc2V0QWRkcmVzc0JhbGFuY2VSZXNwb25zZRIsCgdiYWxhbmNlGAEgASgLMhsudXRpbGEuYXBpLnYxYWxwaGEyLkJhbGFuY2USbgoUcmVmZXJlbmNlZF9yZXNvdXJjZXMY6QcgAygLMk8udXRpbGEuYXBpLnYxYWxwaGEyLlJlZnJlc2hBc3NldEFkZHJlc3NCYWxhbmNlUmVzcG9uc2UuUmVmZXJlbmNlZFJlc291cmNlc0VudHJ5GmIKGFJlZmVyZW5jZWRSZXNvdXJjZXNFbnRyeRILCgNrZXkYASABKAkSNQoFdmFsdWUYAiABKAsyJi51dGlsYS5hcGkudjFhbHBoYTIuUmVmZXJlbmNlZFJlc291cmNlOgI4ATLhBAoIQmFsYW5jZXMSpwEKDVF1ZXJ5QmFsYW5jZXMSKC51dGlsYS5hcGkudjFhbHBoYTIuUXVlcnlCYWxhbmNlc1JlcXVlc3QaKS51dGlsYS5hcGkudjFhbHBoYTIuUXVlcnlCYWxhbmNlc1Jlc3BvbnNlIkHaQQZwYXJlbnSYtRgBgtPkkwIuOgEqIikvdjFhbHBoYTIve3BhcmVudD12YXVsdHMvKn06cXVlcnlCYWxhbmNlcxLDAQoTUXVlcnlXYWxsZXRCYWxhbmNlcxIuLnV0aWxhLmFwaS52MWFscGhhMi5RdWVyeVdhbGxldEJhbGFuY2VzUmVxdWVzdBovLnV0aWxhLmFwaS52MWFscGhhMi5RdWVyeVdhbGxldEJhbGFuY2VzUmVzcG9uc2UiS9pBBnBhcmVudJi1GAGC0+STAjg6ASoiMy92MWFscGhhMi97cGFyZW50PXZhdWx0cy8qL3dhbGxldHMvKn06cXVlcnlCYWxhbmNlcxLkAQoaUXVlcnlXYWxsZXRBZGRyZXNzQmFsYW5jZXMSNS51dGlsYS5hcGkudjFhbHBoYTIuUXVlcnlXYWxsZXRBZGRyZXNzQmFsYW5jZXNSZXF1ZXN0GjYudXRpbGEuYXBpLnYxYWxwaGEyLlF1ZXJ5V2FsbGV0QWRkcmVzc0JhbGFuY2VzUmVzcG9uc2UiV9pBBnBhcmVudJi1GAGC0+STAkQ6ASoiPy92MWFscGhhMi97cGFyZW50PXZhdWx0cy8qL3dhbGxldHMvKi9hZGRyZXNzZXMvKn06cXVlcnlCYWxhbmNlc0IqWih1dGlsYS5pby9nZW5wcm90by9hcGkvdjFhbHBoYTI7YXBpdjFhMnBiYgZwcm90bzM", [file_google_api_annotations, file_google_api_client, file_google_api_field_behavior, file_google_api_resource, file_google_api_visibility, file_google_protobuf_descriptor, file_protoc_gen_openapiv2_options_annotations, file_utila_api_v1_api, file_utila_api_v1alpha2_resources, file_utila_api_v1alpha2_types]);

/**
 * @generated from message utila.api.v1alpha2.QueryBalancesRequest
 */
export type QueryBalancesRequest = Message<"utila.api.v1alpha2.QueryBalancesRequest"> & {
  /**
   * The parent vault resource whose balances are to be listed.
   *
   * Format: `vaults/{vault_id}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * Filter results using EBNF syntax.
   *
   * Supported functions:
   * * `asset(asset_name)` (example: `asset("assets/native.ethereum-mainnet")`)
   * * `network(network_name)` (example: `network("networks/ethereum-mainnet")`)
   * * `wallet_external()` (example: `wallet_external()`)
   *
   * @generated from field: string filter = 2;
   */
  filter: string;

  /**
   * SQL-like ordering specifications. Supports the field converted_value.
   *
   * @generated from field: int32 page_size = 5;
   */
  pageSize: number;

  /**
   * The maximum number of items to return. The service may return fewer than this value.
   *
   * @generated from field: string page_token = 6;
   */
  pageToken: string;

  /**
   * A page token, received from the previous list call as `nextPageToken`.
   *
   * @generated from field: bool include_referenced_resources = 7;
   */
  includeReferencedResources: boolean;
};

/**
 * Describes the message utila.api.v1alpha2.QueryBalancesRequest.
 * Use `create(QueryBalancesRequestSchema)` to create a new message.
 */
export const QueryBalancesRequestSchema: GenMessage<QueryBalancesRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 0);

/**
 * @generated from message utila.api.v1alpha2.QueryBalancesResponse
 */
export type QueryBalancesResponse = Message<"utila.api.v1alpha2.QueryBalancesResponse"> & {
  /**
   * The balances returned.
   *
   * @generated from field: repeated utila.api.v1alpha2.Balance balances = 1;
   */
  balances: Balance[];

  /**
   * A token, which can be sent as `pageToken` to retrieve the next page.
   * If this field is omitted, there are no subsequent pages.
   *
   * @generated from field: string next_page_token = 2;
   */
  nextPageToken: string;

  /**
   * Total number of items in the response, regardless of pagination.
   *
   * @generated from field: int32 total_size = 3;
   */
  totalSize: number;

  /**
   * A mapping of the referenced resources in the message.
   * The key is the resource name and the value is the corresponding resource.
   *
   * @generated from field: map<string, utila.api.v1alpha2.ReferencedResource> referenced_resources = 1001;
   */
  referencedResources: { [key: string]: ReferencedResource };
};

/**
 * Describes the message utila.api.v1alpha2.QueryBalancesResponse.
 * Use `create(QueryBalancesResponseSchema)` to create a new message.
 */
export const QueryBalancesResponseSchema: GenMessage<QueryBalancesResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 1);

/**
 * @generated from message utila.api.v1alpha2.Balance
 */
export type Balance = Message<"utila.api.v1alpha2.Balance"> & {
  /**
   * The resource name of the asset.
   *
   * Format: `assets/{asset_id}`
   *
   * @generated from field: string asset = 2;
   */
  asset: string;

  /**
   * The amount of the asset, in decimal form with precision included.
   *
   * @generated from field: string value = 3;
   */
  value: string;

  /**
   * The raw amount of the asset that this balance contains.
   *
   * Specified in the smallest unit of the Asset.
   *
   * @generated from field: string raw_value = 4;
   */
  rawValue: string;
};

/**
 * Describes the message utila.api.v1alpha2.Balance.
 * Use `create(BalanceSchema)` to create a new message.
 */
export const BalanceSchema: GenMessage<Balance> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 2);

/**
 * @generated from message utila.api.v1alpha2.Balance.Utila
 */
export type Balance_Utila = Message<"utila.api.v1alpha2.Balance.Utila"> & {
  /**
   * The number of wallets that the balance is associated with.
   *
   * @generated from field: int32 wallet_count = 1;
   */
  walletCount: number;

  /**
   * @generated from field: int32 external_wallet_count = 2;
   */
  externalWalletCount: number;
};

/**
 * Describes the message utila.api.v1alpha2.Balance.Utila.
 * Use `create(Balance_UtilaSchema)` to create a new message.
 */
export const Balance_UtilaSchema: GenMessage<Balance_Utila> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 2, 0);

/**
 * @generated from message utila.api.v1alpha2.QueryWalletBalancesRequest
 */
export type QueryWalletBalancesRequest = Message<"utila.api.v1alpha2.QueryWalletBalancesRequest"> & {
  /**
   * The parent wallet whose balances are to be listed.
   *
   * Format: `vaults/{vault_id}/wallets/{wallet_id}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * Filter results using EBNF syntax.
   *
   * Supported functions:
   * * `asset(asset_name)` (example: `asset("assets/native.ethereum-mainnet")`)
   * * `network(network_name)` (example: `network("networks/ethereum-mainnet")`)
   * * `wallet_external()` (example: `wallet_external()`)
   *
   * @generated from field: string filter = 2;
   */
  filter: string;

  /**
   * SQL-like ordering specifications.
   *
   * @generated from field: int32 page_size = 5;
   */
  pageSize: number;

  /**
   * The maximum number of items to return. The service may return fewer than this value.
   *
   * @generated from field: string page_token = 6;
   */
  pageToken: string;

  /**
   * A page token, received from the previous list call as `nextPageToken`.
   *
   * @generated from field: bool include_referenced_resources = 7;
   */
  includeReferencedResources: boolean;
};

/**
 * Describes the message utila.api.v1alpha2.QueryWalletBalancesRequest.
 * Use `create(QueryWalletBalancesRequestSchema)` to create a new message.
 */
export const QueryWalletBalancesRequestSchema: GenMessage<QueryWalletBalancesRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 3);

/**
 * @generated from message utila.api.v1alpha2.QueryWalletBalancesResponse
 */
export type QueryWalletBalancesResponse = Message<"utila.api.v1alpha2.QueryWalletBalancesResponse"> & {
  /**
   * The balances returned.
   *
   * @generated from field: repeated utila.api.v1alpha2.WalletBalance wallet_balances = 1;
   */
  walletBalances: WalletBalance[];

  /**
   * A token, which can be sent as `pageToken` to retrieve the next page.
   * If this field is omitted, there are no subsequent pages.
   *
   * @generated from field: string next_page_token = 2;
   */
  nextPageToken: string;

  /**
   * Total number of items in the response, regardless of pagination.
   *
   * @generated from field: int32 total_size = 3;
   */
  totalSize: number;

  /**
   * A mapping of the referenced resources in the message.
   * The key is the resource name and the value is the corresponding resource.
   *
   * This field is only populated if the `includeReferencedResources` field is set to `true`.
   *
   * @generated from field: map<string, utila.api.v1alpha2.ReferencedResource> referenced_resources = 1001;
   */
  referencedResources: { [key: string]: ReferencedResource };
};

/**
 * Describes the message utila.api.v1alpha2.QueryWalletBalancesResponse.
 * Use `create(QueryWalletBalancesResponseSchema)` to create a new message.
 */
export const QueryWalletBalancesResponseSchema: GenMessage<QueryWalletBalancesResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 4);

/**
 * @generated from message utila.api.v1alpha2.WalletBalance
 */
export type WalletBalance = Message<"utila.api.v1alpha2.WalletBalance"> & {
  /**
   * The resource name of the asset.
   *
   * Format: `assets/{asset_id}`
   *
   * @generated from field: string asset = 2;
   */
  asset: string;

  /**
   * The resource name of the wallet.
   *
   * Format: `vaults/{vault_id}/wallets/{wallet_id}`
   *
   * @generated from field: string wallet = 3;
   */
  wallet: string;

  /**
   * The amount of the asset, in decimal form with precision included.
   *
   * @generated from field: string value = 4;
   */
  value: string;

  /**
   * The raw amount of the asset that this balance contains.
   *
   * Specified in the smallest unit of the Asset.
   *
   * @generated from field: string raw_value = 5;
   */
  rawValue: string;
};

/**
 * Describes the message utila.api.v1alpha2.WalletBalance.
 * Use `create(WalletBalanceSchema)` to create a new message.
 */
export const WalletBalanceSchema: GenMessage<WalletBalance> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 5);

/**
 * @generated from message utila.api.v1alpha2.QueryWalletAddressBalancesRequest
 */
export type QueryWalletAddressBalancesRequest = Message<"utila.api.v1alpha2.QueryWalletAddressBalancesRequest"> & {
  /**
   * The parent wallet address whose balances are to be listed.
   *
   * Format: `vaults/{vault_id}/wallets/{wallet_id}/addresses/{address_id}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * Filter results using EBNF syntax.
   *
   * Supported functions:
   * * `asset(asset_name)` (example: `asset("assets/native.ethereum-mainnet")`)
   * * `network(network_name)` (example: `network("networks/ethereum-mainnet")`)
   * * `wallet_external()` (example: `wallet_external()`)
   *
   * @generated from field: string filter = 2;
   */
  filter: string;

  /**
   * SQL-like ordering specifications.
   *
   * @generated from field: int32 page_size = 5;
   */
  pageSize: number;

  /**
   * The maximum number of items to return. The service may return fewer than this value.
   *
   * @generated from field: string page_token = 6;
   */
  pageToken: string;

  /**
   * A page token, received from the previous list call as `nextPageToken`.
   *
   * @generated from field: bool include_referenced_resources = 7;
   */
  includeReferencedResources: boolean;
};

/**
 * Describes the message utila.api.v1alpha2.QueryWalletAddressBalancesRequest.
 * Use `create(QueryWalletAddressBalancesRequestSchema)` to create a new message.
 */
export const QueryWalletAddressBalancesRequestSchema: GenMessage<QueryWalletAddressBalancesRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 6);

/**
 * @generated from message utila.api.v1alpha2.QueryWalletAddressBalancesResponse
 */
export type QueryWalletAddressBalancesResponse = Message<"utila.api.v1alpha2.QueryWalletAddressBalancesResponse"> & {
  /**
   * The balances returned.
   *
   * @generated from field: repeated utila.api.v1alpha2.WalletAddressBalance wallet_address_balances = 1;
   */
  walletAddressBalances: WalletAddressBalance[];

  /**
   * A token, which can be sent as `pageToken` to retrieve the next page.
   * If this field is omitted, there are no subsequent pages.
   *
   * @generated from field: string next_page_token = 2;
   */
  nextPageToken: string;

  /**
   * Total number of items in the response, regardless of pagination.
   *
   * @generated from field: int32 total_size = 3;
   */
  totalSize: number;

  /**
   * A mapping of the referenced resources in the message.
   * The key is the resource name and the value is the corresponding resource.
   *
   * This field is only populated if the `includeReferencedResources` field is set to `true`.
   *
   * @generated from field: map<string, utila.api.v1alpha2.ReferencedResource> referenced_resources = 1001;
   */
  referencedResources: { [key: string]: ReferencedResource };
};

/**
 * Describes the message utila.api.v1alpha2.QueryWalletAddressBalancesResponse.
 * Use `create(QueryWalletAddressBalancesResponseSchema)` to create a new message.
 */
export const QueryWalletAddressBalancesResponseSchema: GenMessage<QueryWalletAddressBalancesResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 7);

/**
 * @generated from message utila.api.v1alpha2.WalletAddressBalance
 */
export type WalletAddressBalance = Message<"utila.api.v1alpha2.WalletAddressBalance"> & {
  /**
   * The resource name of the asset.
   *
   * Format: `assets/{asset_id}`
   *
   * @generated from field: string asset = 1;
   */
  asset: string;

  /**
   * The resource name of the wallet address.
   *
   * Format: `vaults/{vault_id}/wallets/{wallet_id}/addresses/{address_id}`
   *
   * @generated from field: string wallet_address = 2;
   */
  walletAddress: string;

  /**
   * The amount of the asset, in decimal form with precision included.
   *
   * @generated from field: string value = 3;
   */
  value: string;

  /**
   * The raw amount of the asset that this balance contains.
   *
   * Specified in the smallest unit of the Asset.
   *
   * @generated from field: string raw_value = 4;
   */
  rawValue: string;
};

/**
 * Describes the message utila.api.v1alpha2.WalletAddressBalance.
 * Use `create(WalletAddressBalanceSchema)` to create a new message.
 */
export const WalletAddressBalanceSchema: GenMessage<WalletAddressBalance> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 8);

/**
 * @generated from message utila.api.v1alpha2.SumBalancesRequest
 */
export type SumBalancesRequest = Message<"utila.api.v1alpha2.SumBalancesRequest"> & {
  /**
   * The parent vault whose balances are to be summed.
   *
   * Format: `vaults/{vault_id}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * Filter wallets sum results using EBNF syntax.
   *
   * Supported fields:
   * * `external`
   *
   * @generated from field: string wallets_sum_filter = 2;
   */
  walletsSumFilter: string;
};

/**
 * Describes the message utila.api.v1alpha2.SumBalancesRequest.
 * Use `create(SumBalancesRequestSchema)` to create a new message.
 */
export const SumBalancesRequestSchema: GenMessage<SumBalancesRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 9);

/**
 * @generated from message utila.api.v1alpha2.SumBalancesResponse
 */
export type SumBalancesResponse = Message<"utila.api.v1alpha2.SumBalancesResponse"> & {
  /**
   * The sum of wallet balances.
   *
   * @generated from field: utila.api.v1alpha2.ConvertedValue wallets_sum = 1;
   */
  walletsSum?: ConvertedValue;

  /**
   * The sum of exchange balances.
   *
   * @generated from field: utila.api.v1alpha2.ConvertedValue exchanges_sum = 2;
   */
  exchangesSum?: ConvertedValue;

  /**
   * The sum of defi positions.
   *
   * @generated from field: utila.api.v1alpha2.ConvertedValue defi_positions_sum = 3;
   */
  defiPositionsSum?: ConvertedValue;
};

/**
 * Describes the message utila.api.v1alpha2.SumBalancesResponse.
 * Use `create(SumBalancesResponseSchema)` to create a new message.
 */
export const SumBalancesResponseSchema: GenMessage<SumBalancesResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 10);

/**
 * @generated from message utila.api.v1alpha2.RefreshAssetAddressBalanceRequest
 */
export type RefreshAssetAddressBalanceRequest = Message<"utila.api.v1alpha2.RefreshAssetAddressBalanceRequest"> & {
  /**
   * Format: `vaults/{vault_id}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * @generated from field: string asset = 2;
   */
  asset: string;

  /**
   * @generated from field: string address = 3;
   */
  address: string;

  /**
   * Include referenced resources in the response.
   *
   * @generated from field: bool include_referenced_resources = 4;
   */
  includeReferencedResources: boolean;
};

/**
 * Describes the message utila.api.v1alpha2.RefreshAssetAddressBalanceRequest.
 * Use `create(RefreshAssetAddressBalanceRequestSchema)` to create a new message.
 */
export const RefreshAssetAddressBalanceRequestSchema: GenMessage<RefreshAssetAddressBalanceRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 11);

/**
 * @generated from message utila.api.v1alpha2.RefreshAssetAddressBalanceResponse
 */
export type RefreshAssetAddressBalanceResponse = Message<"utila.api.v1alpha2.RefreshAssetAddressBalanceResponse"> & {
  /**
   * @generated from field: utila.api.v1alpha2.Balance balance = 1;
   */
  balance?: Balance;

  /**
   * A mapping of the referenced resources in the message.
   * The key is the resource name and the value is the corresponding resource.
   * This field is only populated if the `includeReferencedResources` field is set to `true`.
   *
   * @generated from field: map<string, utila.api.v1alpha2.ReferencedResource> referenced_resources = 1001;
   */
  referencedResources: { [key: string]: ReferencedResource };
};

/**
 * Describes the message utila.api.v1alpha2.RefreshAssetAddressBalanceResponse.
 * Use `create(RefreshAssetAddressBalanceResponseSchema)` to create a new message.
 */
export const RefreshAssetAddressBalanceResponseSchema: GenMessage<RefreshAssetAddressBalanceResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_balances, 12);

/**
 * @generated from service utila.api.v1alpha2.Balances
 */
export const Balances: GenService<{
  /**
   * SumBalances
   *
   * Sum the balances (USD) across the vault.
   *
   * @generated from rpc utila.api.v1alpha2.Balances.QueryBalances
   */
  queryBalances: {
    methodKind: "unary";
    input: typeof QueryBalancesRequestSchema;
    output: typeof QueryBalancesResponseSchema;
  },
  /**
   * QueryBalances
   *
   * Retrieve a list of all asset balances in all wallets in a vault.
   *
   * @generated from rpc utila.api.v1alpha2.Balances.QueryWalletBalances
   */
  queryWalletBalances: {
    methodKind: "unary";
    input: typeof QueryWalletBalancesRequestSchema;
    output: typeof QueryWalletBalancesResponseSchema;
  },
  /**
   * QueryWalletBalances
   *
   * Retrieve a list of all asset balances in a wallet. Can be used also to retrieve assets across all wallets as per
   * [AIP-159](https://google.aip.dev/159) by using '-' (the hyphen or dash character) as a wildcard character instead of wallet ID in the parent.
   *
   * @generated from rpc utila.api.v1alpha2.Balances.QueryWalletAddressBalances
   */
  queryWalletAddressBalances: {
    methodKind: "unary";
    input: typeof QueryWalletAddressBalancesRequestSchema;
    output: typeof QueryWalletAddressBalancesResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_utila_api_v1alpha2_balances, 0);

