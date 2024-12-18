// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1alpha2/assets.proto (package utila.api.v1alpha2, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_google_api_annotations } from "../../../google/api/annotations_pb";
import { file_google_api_client } from "../../../google/api/client_pb";
import { file_google_api_field_behavior } from "../../../google/api/field_behavior_pb";
import { file_google_api_resource } from "../../../google/api/resource_pb";
import { file_google_api_visibility } from "../../../google/api/visibility_pb";
import { file_google_protobuf_descriptor } from "@bufbuild/protobuf/wkt";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../protoc-gen-openapiv2/options/annotations_pb";
import { file_utila_api_v1_api } from "../v1/api_pb";
import type { ConvertedValue } from "./types_pb";
import { file_utila_api_v1alpha2_types } from "./types_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1alpha2/assets.proto.
 */
export const file_utila_api_v1alpha2_assets: GenFile = /*@__PURE__*/
  fileDesc("Ch91dGlsYS9hcGkvdjFhbHBoYTIvYXNzZXRzLnByb3RvEhJ1dGlsYS5hcGkudjFhbHBoYTIiiwIKDkFzc2V0VG9rZW5JbmZvEhgKEGNvbnRyYWN0X2FkZHJlc3MYASABKAkSQgoIc3RhbmRhcmQYAiABKA4yMC51dGlsYS5hcGkudjFhbHBoYTIuQXNzZXRUb2tlbkluZm8uU3RhbmRhcmQuRW51bRISCgVkZW5vbRgDIAEoCUgAiAEBGn0KCFN0YW5kYXJkInEKBEVudW0SFAoQRU5VTV9VTlNQRUNJRklFRBAAEgkKBUVSQzIwEAESCgoGRVJDNzIxEAISCwoHRVJDMTE1NRADEgkKBVRSQzIwEAQSDQoJU1BMX1RPS0VOEAUSCQoFSUNTMjAQBhIKCgZKRVRUT04QB0IICgZfZGVub20iuwQKBUFzc2V0EgwKBG5hbWUYASABKAkSFAoMZGlzcGxheV9uYW1lGAIgASgJEkoKB25ldHdvcmsYAyABKAlCOZJBHUobIm5ldHdvcmtzL2V0aGVyZXVtLW1haW5uZXQi+kEWChRhcGkudXRpbGEuaW8vTmV0d29yaxIxCgR0eXBlGAQgASgOMiMudXRpbGEuYXBpLnYxYWxwaGEyLkFzc2V0LlR5cGUuRW51bRIOCgZzeW1ib2wYBiABKAkSEAoIZGVjaW1hbHMYCSABKAUSOwoPY29udmVydGVkX3ZhbHVlGAUgASgLMiIudXRpbGEuYXBpLnYxYWxwaGEyLkNvbnZlcnRlZFZhbHVlEjYKCnRva2VuX2luZm8YByABKAsyIi51dGlsYS5hcGkudjFhbHBoYTIuQXNzZXRUb2tlbkluZm8aRAoEVHlwZSI8CgRFbnVtEhQKEEVOVU1fVU5TUEVDSUZJRUQQABITCg9OQVRJVkVfQ1VSUkVOQ1kQARIJCgVUT0tFThACGnoKBVV0aWxhEkMKDXZhdWx0X2NvbnRleHQYASABKAsyLC51dGlsYS5hcGkudjFhbHBoYTIuQXNzZXQuVXRpbGEuVmF1bHRDb250ZXh0EgoKAmlkGAIgASgJGiAKDFZhdWx0Q29udGV4dBIQCghpbXBvcnRlZBgBIAEoCDo26kEzChJhcGkudXRpbGEuaW8vQXNzZXQSDmFzc2V0cy97YXNzZXR9KgZhc3NldHMyBWFzc2V0IlIKD0dldEFzc2V0UmVxdWVzdBI/CgRuYW1lGAEgASgJQjGSQRPKPhD6Ag1uYW1lPWFzc2V0cy8q4kEBAvpBFAoSYXBpLnV0aWxhLmlvL0Fzc2V0IjwKEEdldEFzc2V0UmVzcG9uc2USKAoFYXNzZXQYASABKAsyGS51dGlsYS5hcGkudjFhbHBoYTIuQXNzZXQiQwoVQmF0Y2hHZXRBc3NldHNSZXF1ZXN0EioKBW5hbWVzGAEgAygJQhviQQEC+kEUChJhcGkudXRpbGEuaW8vQXNzZXQiQwoWQmF0Y2hHZXRBc3NldHNSZXNwb25zZRIpCgZhc3NldHMYASADKAsyGS51dGlsYS5hcGkudjFhbHBoYTIuQXNzZXQynwIKBkFzc2V0cxKDAQoIR2V0QXNzZXQSIy51dGlsYS5hcGkudjFhbHBoYTIuR2V0QXNzZXRSZXF1ZXN0GiQudXRpbGEuYXBpLnYxYWxwaGEyLkdldEFzc2V0UmVzcG9uc2UiLNpBBG5hbWWYtRgBgtPkkwIbEhkvdjFhbHBoYTIve25hbWU9YXNzZXRzLyp9Eo4BCg5CYXRjaEdldEFzc2V0cxIpLnV0aWxhLmFwaS52MWFscGhhMi5CYXRjaEdldEFzc2V0c1JlcXVlc3QaKi51dGlsYS5hcGkudjFhbHBoYTIuQmF0Y2hHZXRBc3NldHNSZXNwb25zZSIlmLUYAYLT5JMCGxIZL3YxYWxwaGEyL2Fzc2V0czpiYXRjaEdldEIqWih1dGlsYS5pby9nZW5wcm90by9hcGkvdjFhbHBoYTI7YXBpdjFhMnBiYgZwcm90bzM", [file_google_api_annotations, file_google_api_client, file_google_api_field_behavior, file_google_api_resource, file_google_api_visibility, file_google_protobuf_descriptor, file_protoc_gen_openapiv2_options_annotations, file_utila_api_v1_api, file_utila_api_v1alpha2_types]);

/**
 * @generated from message utila.api.v1alpha2.AssetTokenInfo
 */
export type AssetTokenInfo = Message<"utila.api.v1alpha2.AssetTokenInfo"> & {
  /**
   * The contract address of the token.
   *
   * @generated from field: string contract_address = 1;
   */
  contractAddress: string;

  /**
   * The token standard.
   *
   * @generated from field: utila.api.v1alpha2.AssetTokenInfo.Standard.Enum standard = 2;
   */
  standard: AssetTokenInfo_Standard_Enum;

  /**
   * The denom of the token on cosmos ecosystem.
   *
   * @generated from field: optional string denom = 3;
   */
  denom?: string;
};

/**
 * Describes the message utila.api.v1alpha2.AssetTokenInfo.
 * Use `create(AssetTokenInfoSchema)` to create a new message.
 */
export const AssetTokenInfoSchema: GenMessage<AssetTokenInfo> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 0);

/**
 * Namespace wrapper for enum.
 *
 * @generated from message utila.api.v1alpha2.AssetTokenInfo.Standard
 */
export type AssetTokenInfo_Standard = Message<"utila.api.v1alpha2.AssetTokenInfo.Standard"> & {
};

/**
 * Describes the message utila.api.v1alpha2.AssetTokenInfo.Standard.
 * Use `create(AssetTokenInfo_StandardSchema)` to create a new message.
 */
export const AssetTokenInfo_StandardSchema: GenMessage<AssetTokenInfo_Standard> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 0, 0);

/**
 * The token standard.
 *
 * @generated from enum utila.api.v1alpha2.AssetTokenInfo.Standard.Enum
 */
export enum AssetTokenInfo_Standard_Enum {
  /**
   * Default value. This value is unused.
   *
   * @generated from enum value: ENUM_UNSPECIFIED = 0;
   */
  ENUM_UNSPECIFIED = 0,

  /**
   * ERC20 is the most common fungible token standard.
   *
   * @generated from enum value: ERC20 = 1;
   */
  ERC20 = 1,

  /**
   * ERC721 is the most common non-fungible token standard.
   *
   * @generated from enum value: ERC721 = 2;
   */
  ERC721 = 2,

  /**
   * ERC1155 is a newer token standard that allows for multiple tokens to be
   * held in a single contract.
   *
   * @generated from enum value: ERC1155 = 3;
   */
  ERC1155 = 3,

  /**
   * TRC20 is the most common tron's fungible token standard.
   *
   * @generated from enum value: TRC20 = 4;
   */
  TRC20 = 4,

  /**
   * SPL Token - solana's token standard.
   *
   * @generated from enum value: SPL_TOKEN = 5;
   */
  SPL_TOKEN = 5,

  /**
   * ICS20 cosmos's token standard.
   *
   * @generated from enum value: ICS20 = 6;
   */
  ICS20 = 6,

  /**
   * JETTON TON's token standard.
   *
   * @generated from enum value: JETTON = 7;
   */
  JETTON = 7,
}

/**
 * Describes the enum utila.api.v1alpha2.AssetTokenInfo.Standard.Enum.
 */
export const AssetTokenInfo_Standard_EnumSchema: GenEnum<AssetTokenInfo_Standard_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha2_assets, 0, 0, 0);

/**
 * @generated from message utila.api.v1alpha2.Asset
 */
export type Asset = Message<"utila.api.v1alpha2.Asset"> & {
  /**
   * The resource name of the asset.
   *
   * Format: `assets/{asset_id}`
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * The display name of the asset.
   *
   * Example: "Bitcoin"
   *
   * @generated from field: string display_name = 2;
   */
  displayName: string;

  /**
   * The resource name of the network.
   *
   * Format: `networks/{network_id}`.
   *
   * @generated from field: string network = 3;
   */
  network: string;

  /**
   * The type of the asset.
   *
   * @generated from field: utila.api.v1alpha2.Asset.Type.Enum type = 4;
   */
  type: Asset_Type_Enum;

  /**
   * The symbol of the asset.
   *
   * Should not be trusted as this is the contract advertised symbol for non-native
   * assets.
   *
   * @generated from field: string symbol = 6;
   */
  symbol: string;

  /**
   * The decimals of the asset.
   *
   * @generated from field: int32 decimals = 9;
   */
  decimals: number;

  /**
   * The converted value of the asset.
   *
   * @generated from field: utila.api.v1alpha2.ConvertedValue converted_value = 5;
   */
  convertedValue?: ConvertedValue;

  /**
   * The token info of the asset.
   *
   * Only present if the asset is a token.
   *
   * @generated from field: utila.api.v1alpha2.AssetTokenInfo token_info = 7;
   */
  tokenInfo?: AssetTokenInfo;
};

/**
 * Describes the message utila.api.v1alpha2.Asset.
 * Use `create(AssetSchema)` to create a new message.
 */
export const AssetSchema: GenMessage<Asset> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 1);

/**
 * Namespace wrapper for enum.
 *
 * @generated from message utila.api.v1alpha2.Asset.Type
 */
export type Asset_Type = Message<"utila.api.v1alpha2.Asset.Type"> & {
};

/**
 * Describes the message utila.api.v1alpha2.Asset.Type.
 * Use `create(Asset_TypeSchema)` to create a new message.
 */
export const Asset_TypeSchema: GenMessage<Asset_Type> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 1, 0);

/**
 * The type of the asset.
 *
 * @generated from enum utila.api.v1alpha2.Asset.Type.Enum
 */
export enum Asset_Type_Enum {
  /**
   * Default value. This value is unused.
   *
   * @generated from enum value: ENUM_UNSPECIFIED = 0;
   */
  ENUM_UNSPECIFIED = 0,

  /**
   * The asset is a native currency.
   *
   * @generated from enum value: NATIVE_CURRENCY = 1;
   */
  NATIVE_CURRENCY = 1,

  /**
   * The asset is a token.
   *
   * @generated from enum value: TOKEN = 2;
   */
  TOKEN = 2,
}

/**
 * Describes the enum utila.api.v1alpha2.Asset.Type.Enum.
 */
export const Asset_Type_EnumSchema: GenEnum<Asset_Type_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha2_assets, 1, 0, 0);

/**
 * @generated from message utila.api.v1alpha2.Asset.Utila
 */
export type Asset_Utila = Message<"utila.api.v1alpha2.Asset.Utila"> & {
  /**
   * The vault specific information of the asset.
   *
   * @generated from field: utila.api.v1alpha2.Asset.Utila.VaultContext vault_context = 1;
   */
  vaultContext?: Asset_Utila_VaultContext;

  /**
   * @generated from field: string id = 2;
   */
  id: string;
};

/**
 * Describes the message utila.api.v1alpha2.Asset.Utila.
 * Use `create(Asset_UtilaSchema)` to create a new message.
 */
export const Asset_UtilaSchema: GenMessage<Asset_Utila> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 1, 1);

/**
 * @generated from message utila.api.v1alpha2.Asset.Utila.VaultContext
 */
export type Asset_Utila_VaultContext = Message<"utila.api.v1alpha2.Asset.Utila.VaultContext"> & {
  /**
   * Whether the asset is imported to the vault or tracked by default.
   *
   * @generated from field: bool imported = 1;
   */
  imported: boolean;
};

/**
 * Describes the message utila.api.v1alpha2.Asset.Utila.VaultContext.
 * Use `create(Asset_Utila_VaultContextSchema)` to create a new message.
 */
export const Asset_Utila_VaultContextSchema: GenMessage<Asset_Utila_VaultContext> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 1, 1, 0);

/**
 * @generated from message utila.api.v1alpha2.GetAssetRequest
 */
export type GetAssetRequest = Message<"utila.api.v1alpha2.GetAssetRequest"> & {
  /**
   * The resource name of the asset.
   *
   * Format: `assets/{asset_id}`
   *
   * @generated from field: string name = 1;
   */
  name: string;
};

/**
 * Describes the message utila.api.v1alpha2.GetAssetRequest.
 * Use `create(GetAssetRequestSchema)` to create a new message.
 */
export const GetAssetRequestSchema: GenMessage<GetAssetRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 2);

/**
 * @generated from message utila.api.v1alpha2.GetAssetResponse
 */
export type GetAssetResponse = Message<"utila.api.v1alpha2.GetAssetResponse"> & {
  /**
   * The asset returned.
   *
   * @generated from field: utila.api.v1alpha2.Asset asset = 1;
   */
  asset?: Asset;
};

/**
 * Describes the message utila.api.v1alpha2.GetAssetResponse.
 * Use `create(GetAssetResponseSchema)` to create a new message.
 */
export const GetAssetResponseSchema: GenMessage<GetAssetResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 3);

/**
 * @generated from message utila.api.v1alpha2.BatchGetAssetsRequest
 */
export type BatchGetAssetsRequest = Message<"utila.api.v1alpha2.BatchGetAssetsRequest"> & {
  /**
   * Repeated resource names of the requested assets.
   *
   * Format: `assets/{asset_id}`
   *
   * @generated from field: repeated string names = 1;
   */
  names: string[];
};

/**
 * Describes the message utila.api.v1alpha2.BatchGetAssetsRequest.
 * Use `create(BatchGetAssetsRequestSchema)` to create a new message.
 */
export const BatchGetAssetsRequestSchema: GenMessage<BatchGetAssetsRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 4);

/**
 * @generated from message utila.api.v1alpha2.BatchGetAssetsResponse
 */
export type BatchGetAssetsResponse = Message<"utila.api.v1alpha2.BatchGetAssetsResponse"> & {
  /**
   * The assets returned.
   *
   * @generated from field: repeated utila.api.v1alpha2.Asset assets = 1;
   */
  assets: Asset[];
};

/**
 * Describes the message utila.api.v1alpha2.BatchGetAssetsResponse.
 * Use `create(BatchGetAssetsResponseSchema)` to create a new message.
 */
export const BatchGetAssetsResponseSchema: GenMessage<BatchGetAssetsResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_assets, 5);

/**
 * @generated from service utila.api.v1alpha2.Assets
 */
export const Assets: GenService<{
  /**
   * GetAsset
   *
   * Retrieves an asset by resource name.
   *
   * @generated from rpc utila.api.v1alpha2.Assets.GetAsset
   */
  getAsset: {
    methodKind: "unary";
    input: typeof GetAssetRequestSchema;
    output: typeof GetAssetResponseSchema;
  },
  /**
   * BatchGetAssets
   *
   * Retrieves a list of assets by resource name.
   *
   * @generated from rpc utila.api.v1alpha2.Assets.BatchGetAssets
   */
  batchGetAssets: {
    methodKind: "unary";
    input: typeof BatchGetAssetsRequestSchema;
    output: typeof BatchGetAssetsResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_utila_api_v1alpha2_assets, 0);

