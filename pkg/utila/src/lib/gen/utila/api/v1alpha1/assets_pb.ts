// (-- api-linter: core::0123::duplicate-resource=disabled
//     aip.dev/not-precedent: For AssetV2 (as the regular Asset but `string network` instead of a miniview). --)

// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1alpha1/assets.proto (package utila.api.v1alpha1, syntax proto3)
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
import { file_utila_api_v1alpha1_types } from "./types_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1alpha1/assets.proto.
 */
export const file_utila_api_v1alpha1_assets: GenFile = /*@__PURE__*/
  fileDesc("Ch91dGlsYS9hcGkvdjFhbHBoYTEvYXNzZXRzLnByb3RvEhJ1dGlsYS5hcGkudjFhbHBoYTEiiAEKDEFzc2V0TkZUSW5mbxIUCgxkaXNwbGF5X25hbWUYASABKAkSHwoXY29sbGVjdGlvbl9kaXNwbGF5X25hbWUYAiABKAkSEQoJaW1hZ2VfdXJpGAMgASgJEhwKFGNvbGxlY3Rpb25faW1hZ2VfdXJpGAQgASgJEhAKCHRva2VuX2lkGAUgASgJIosCCg5Bc3NldFRva2VuSW5mbxIYChBjb250cmFjdF9hZGRyZXNzGAEgASgJEkIKCHN0YW5kYXJkGAIgASgOMjAudXRpbGEuYXBpLnYxYWxwaGExLkFzc2V0VG9rZW5JbmZvLlN0YW5kYXJkLkVudW0SEgoFZGVub20YAyABKAlIAIgBARp9CghTdGFuZGFyZCJxCgRFbnVtEhQKEEVOVU1fVU5TUEVDSUZJRUQQABIJCgVFUkMyMBABEgoKBkVSQzcyMRACEgsKB0VSQzExNTUQAxIJCgVUUkMyMBAEEg0KCVNQTF9UT0tFThAFEgkKBUlDUzIwEAYSCgoGSkVUVE9OEAdCCAoGX2Rlbm9tIp0ECgVBc3NldBIMCgRuYW1lGAEgASgJEhQKDGRpc3BsYXlfbmFtZRgCIAEoCRIyCgduZXR3b3JrGAMgASgLMiEudXRpbGEuYXBpLnYxYWxwaGExLkFzc2V0Lk5ldHdvcmsSMQoEdHlwZRgEIAEoDjIjLnV0aWxhLmFwaS52MWFscGhhMS5Bc3NldC5UeXBlLkVudW0SDgoGc3ltYm9sGAYgASgJEhAKCGRlY2ltYWxzGAkgASgFEjsKD2NvbnZlcnRlZF92YWx1ZRgFIAEoCzIiLnV0aWxhLmFwaS52MWFscGhhMS5Db252ZXJ0ZWRWYWx1ZRI2Cgp0b2tlbl9pbmZvGAcgASgLMiIudXRpbGEuYXBpLnYxYWxwaGExLkFzc2V0VG9rZW5JbmZvEjIKCG5mdF9pbmZvGAggASgLMiAudXRpbGEuYXBpLnYxYWxwaGExLkFzc2V0TkZUSW5mbxpvCgdOZXR3b3JrEkcKBG5hbWUYASABKAlCOZJBHUobIm5ldHdvcmtzL2V0aGVyZXVtLW1haW5uZXQi+kEWChRhcGkudXRpbGEuaW8vTmV0d29yaxIbCgd0ZXN0bmV0GAQgASgIQgqSQQdKBWZhbHNlGk0KBFR5cGUiRQoERW51bRIUChBFTlVNX1VOU1BFQ0lGSUVEEAASEwoPTkFUSVZFX0NVUlJFTkNZEAESCQoFVE9LRU4QAhIHCgNORlQQAyKABAoHQXNzZXRWMhIMCgRuYW1lGAEgASgJEhQKDGRpc3BsYXlfbmFtZRgCIAEoCRJKCgduZXR3b3JrGAMgASgJQjmSQR1KGyJuZXR3b3Jrcy9ldGhlcmV1bS1tYWlubmV0IvpBFgoUYXBpLnV0aWxhLmlvL05ldHdvcmsSMwoEdHlwZRgEIAEoDjIlLnV0aWxhLmFwaS52MWFscGhhMS5Bc3NldFYyLlR5cGUuRW51bRIOCgZzeW1ib2wYBiABKAkSEAoIZGVjaW1hbHMYCSABKAUSOwoPY29udmVydGVkX3ZhbHVlGAUgASgLMiIudXRpbGEuYXBpLnYxYWxwaGExLkNvbnZlcnRlZFZhbHVlEjYKCnRva2VuX2luZm8YByABKAsyIi51dGlsYS5hcGkudjFhbHBoYTEuQXNzZXRUb2tlbkluZm8SMgoIbmZ0X2luZm8YCCABKAsyIC51dGlsYS5hcGkudjFhbHBoYTEuQXNzZXRORlRJbmZvGk0KBFR5cGUiRQoERW51bRIUChBFTlVNX1VOU1BFQ0lGSUVEEAASEwoPTkFUSVZFX0NVUlJFTkNZEAESCQoFVE9LRU4QAhIHCgNORlQQAzo26kEzChJhcGkudXRpbGEuaW8vQXNzZXQSDmFzc2V0cy97YXNzZXR9KgZhc3NldHMyBWFzc2V0IlIKD0dldEFzc2V0UmVxdWVzdBI/CgRuYW1lGAEgASgJQjGSQRPKPhD6Ag1uYW1lPWFzc2V0cy8q4kEBAvpBFAoSYXBpLnV0aWxhLmlvL0Fzc2V0IkMKFUJhdGNoR2V0QXNzZXRzUmVxdWVzdBIqCgVuYW1lcxgBIAMoCUIb4kEBAvpBFAoSYXBpLnV0aWxhLmlvL0Fzc2V0IkMKFkJhdGNoR2V0QXNzZXRzUmVzcG9uc2USKQoGYXNzZXRzGAEgAygLMhkudXRpbGEuYXBpLnYxYWxwaGExLkFzc2V0IkYKEUxpc3RBc3NldHNSZXF1ZXN0EhcKCXBhZ2Vfc2l6ZRgDIAEoBUIE4kEBARIYCgpwYWdlX3Rva2VuGAQgASgJQgTiQQEBIlgKEkxpc3RBc3NldHNSZXNwb25zZRIpCgZhc3NldHMYASADKAsyGS51dGlsYS5hcGkudjFhbHBoYTEuQXNzZXQSFwoPbmV4dF9wYWdlX3Rva2VuGAIgASgJMpMCCgZBc3NldHMSeAoIR2V0QXNzZXQSIy51dGlsYS5hcGkudjFhbHBoYTEuR2V0QXNzZXRSZXF1ZXN0GhkudXRpbGEuYXBpLnYxYWxwaGExLkFzc2V0IizaQQRuYW1lmLUYAYLT5JMCGxIZL3YxYWxwaGExL3tuYW1lPWFzc2V0cy8qfRKOAQoOQmF0Y2hHZXRBc3NldHMSKS51dGlsYS5hcGkudjFhbHBoYTEuQmF0Y2hHZXRBc3NldHNSZXF1ZXN0GioudXRpbGEuYXBpLnYxYWxwaGExLkJhdGNoR2V0QXNzZXRzUmVzcG9uc2UiJZi1GAGC0+STAhsSGS92MWFscGhhMS9hc3NldHM6YmF0Y2hHZXRCJFoidXRpbGEuaW8vZ2VucHJvdG8vYXBpL3YxYWxwaGExO2FwaWIGcHJvdG8z", [file_google_api_annotations, file_google_api_client, file_google_api_field_behavior, file_google_api_resource, file_google_api_visibility, file_google_protobuf_descriptor, file_protoc_gen_openapiv2_options_annotations, file_utila_api_v1_api, file_utila_api_v1alpha1_types]);

/**
 * AssetNFTInfo contains information about a non-fungible token.
 *
 * @generated from message utila.api.v1alpha1.AssetNFTInfo
 */
export type AssetNFTInfo = Message<"utila.api.v1alpha1.AssetNFTInfo"> & {
  /**
   * The display name of the NFT.
   *
   * @generated from field: string display_name = 1;
   */
  displayName: string;

  /**
   * The collection name of the NFT.
   *
   * @generated from field: string collection_display_name = 2;
   */
  collectionDisplayName: string;

  /**
   * The image URI of the NFT.
   *
   * @generated from field: string image_uri = 3;
   */
  imageUri: string;

  /**
   * The collection image URI of the NFT.
   *
   * @generated from field: string collection_image_uri = 4;
   */
  collectionImageUri: string;

  /**
   * The token ID of the NFT.
   *
   * @generated from field: string token_id = 5;
   */
  tokenId: string;
};

/**
 * Describes the message utila.api.v1alpha1.AssetNFTInfo.
 * Use `create(AssetNFTInfoSchema)` to create a new message.
 */
export const AssetNFTInfoSchema: GenMessage<AssetNFTInfo> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 0);

/**
 * AssetTokenInfo contains information about a token.
 *
 * @generated from message utila.api.v1alpha1.AssetTokenInfo
 */
export type AssetTokenInfo = Message<"utila.api.v1alpha1.AssetTokenInfo"> & {
  /**
   * The contract address of the token.
   *
   * @generated from field: string contract_address = 1;
   */
  contractAddress: string;

  /**
   * The token standard.
   *
   * @generated from field: utila.api.v1alpha1.AssetTokenInfo.Standard.Enum standard = 2;
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
 * Describes the message utila.api.v1alpha1.AssetTokenInfo.
 * Use `create(AssetTokenInfoSchema)` to create a new message.
 */
export const AssetTokenInfoSchema: GenMessage<AssetTokenInfo> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 1);

/**
 * Namespace wrapper for enum.
 *
 * @generated from message utila.api.v1alpha1.AssetTokenInfo.Standard
 */
export type AssetTokenInfo_Standard = Message<"utila.api.v1alpha1.AssetTokenInfo.Standard"> & {
};

/**
 * Describes the message utila.api.v1alpha1.AssetTokenInfo.Standard.
 * Use `create(AssetTokenInfo_StandardSchema)` to create a new message.
 */
export const AssetTokenInfo_StandardSchema: GenMessage<AssetTokenInfo_Standard> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 1, 0);

/**
 * The token standard.
 *
 * @generated from enum utila.api.v1alpha1.AssetTokenInfo.Standard.Enum
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
   * JETTON is TON's token standard.
   *
   * @generated from enum value: JETTON = 7;
   */
  JETTON = 7,
}

/**
 * Describes the enum utila.api.v1alpha1.AssetTokenInfo.Standard.Enum.
 */
export const AssetTokenInfo_Standard_EnumSchema: GenEnum<AssetTokenInfo_Standard_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_assets, 1, 0, 0);

/**
 * Asset represents a single asset.
 * (-- api-linter: core::0123::resource-annotation=disabled
 *     aip.dev/not-precedent: Conflicts with AssetV2  --)
 *
 * @generated from message utila.api.v1alpha1.Asset
 */
export type Asset = Message<"utila.api.v1alpha1.Asset"> & {
  /**
   * The resource name of the wallet.
   *
   * Format: `assets/{asset}`
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
   * Minified view of the network of the asset.
   *
   * @generated from field: utila.api.v1alpha1.Asset.Network network = 3;
   */
  network?: Asset_Network;

  /**
   * The type of the asset.
   *
   * @generated from field: utila.api.v1alpha1.Asset.Type.Enum type = 4;
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
   * @generated from field: utila.api.v1alpha1.ConvertedValue converted_value = 5;
   */
  convertedValue?: ConvertedValue;

  /**
   * The token info of the asset.
   *
   * Only present if the asset is a token (fungible and non-fungible).
   *
   * @generated from field: utila.api.v1alpha1.AssetTokenInfo token_info = 7;
   */
  tokenInfo?: AssetTokenInfo;

  /**
   * Additional NFT info of the asset.
   *
   * Only present if the asset is an NFT.
   *
   * @generated from field: utila.api.v1alpha1.AssetNFTInfo nft_info = 8;
   */
  nftInfo?: AssetNFTInfo;
};

/**
 * Describes the message utila.api.v1alpha1.Asset.
 * Use `create(AssetSchema)` to create a new message.
 */
export const AssetSchema: GenMessage<Asset> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 2);

/**
 * A minified view of a network.
 * (-- api-linter: core::0123::resource-annotation=disabled
 *     aip.dev/not-precedent: Minified version of a network. --)
 *
 * @generated from message utila.api.v1alpha1.Asset.Network
 */
export type Asset_Network = Message<"utila.api.v1alpha1.Asset.Network"> & {
  /**
   * The resource name of the network.
   *
   * Format: `networks/{network}`.
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * Whether this network is a testnet.
   *
   * @generated from field: bool testnet = 4;
   */
  testnet: boolean;
};

/**
 * Describes the message utila.api.v1alpha1.Asset.Network.
 * Use `create(Asset_NetworkSchema)` to create a new message.
 */
export const Asset_NetworkSchema: GenMessage<Asset_Network> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 2, 0);

/**
 * Namespace wrapper for enum.
 *
 * @generated from message utila.api.v1alpha1.Asset.Type
 */
export type Asset_Type = Message<"utila.api.v1alpha1.Asset.Type"> & {
};

/**
 * Describes the message utila.api.v1alpha1.Asset.Type.
 * Use `create(Asset_TypeSchema)` to create a new message.
 */
export const Asset_TypeSchema: GenMessage<Asset_Type> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 2, 1);

/**
 * The type of the asset.
 *
 * @generated from enum utila.api.v1alpha1.Asset.Type.Enum
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

  /**
   * The asset is an NFT.
   *
   * @generated from enum value: NFT = 3;
   */
  NFT = 3,
}

/**
 * Describes the enum utila.api.v1alpha1.Asset.Type.Enum.
 */
export const Asset_Type_EnumSchema: GenEnum<Asset_Type_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_assets, 2, 1, 0);

/**
 * Asset
 *
 * @generated from message utila.api.v1alpha1.AssetV2
 */
export type AssetV2 = Message<"utila.api.v1alpha1.AssetV2"> & {
  /**
   * The resource name of the asset.
   *
   * Format: `assets/{asset}`
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
   * Format: `networks/{network}`.
   *
   * @generated from field: string network = 3;
   */
  network: string;

  /**
   * The type of the asset.
   *
   * @generated from field: utila.api.v1alpha1.AssetV2.Type.Enum type = 4;
   */
  type: AssetV2_Type_Enum;

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
   * @generated from field: utila.api.v1alpha1.ConvertedValue converted_value = 5;
   */
  convertedValue?: ConvertedValue;

  /**
   * The token info of the asset.
   *
   * Only present if the asset is a token (fungible and non-fungible).
   *
   * @generated from field: utila.api.v1alpha1.AssetTokenInfo token_info = 7;
   */
  tokenInfo?: AssetTokenInfo;

  /**
   * Additional NFT info of the asset.
   *
   * Only present if the asset is an NFT.
   *
   * @generated from field: utila.api.v1alpha1.AssetNFTInfo nft_info = 8;
   */
  nftInfo?: AssetNFTInfo;
};

/**
 * Describes the message utila.api.v1alpha1.AssetV2.
 * Use `create(AssetV2Schema)` to create a new message.
 */
export const AssetV2Schema: GenMessage<AssetV2> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 3);

/**
 * Namespace wrapper for enum.
 *
 * @generated from message utila.api.v1alpha1.AssetV2.Type
 */
export type AssetV2_Type = Message<"utila.api.v1alpha1.AssetV2.Type"> & {
};

/**
 * Describes the message utila.api.v1alpha1.AssetV2.Type.
 * Use `create(AssetV2_TypeSchema)` to create a new message.
 */
export const AssetV2_TypeSchema: GenMessage<AssetV2_Type> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 3, 0);

/**
 * The type of the asset.
 *
 * @generated from enum utila.api.v1alpha1.AssetV2.Type.Enum
 */
export enum AssetV2_Type_Enum {
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

  /**
   * The asset is an NFT.
   *
   * @generated from enum value: NFT = 3;
   */
  NFT = 3,
}

/**
 * Describes the enum utila.api.v1alpha1.AssetV2.Type.Enum.
 */
export const AssetV2_Type_EnumSchema: GenEnum<AssetV2_Type_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_assets, 3, 0, 0);

/**
 * The request message for GetAsset.
 *
 * @generated from message utila.api.v1alpha1.GetAssetRequest
 */
export type GetAssetRequest = Message<"utila.api.v1alpha1.GetAssetRequest"> & {
  /**
   * The resource name of the asset.
   *
   * Format: `assets/{asset}`
   *
   * @generated from field: string name = 1;
   */
  name: string;
};

/**
 * Describes the message utila.api.v1alpha1.GetAssetRequest.
 * Use `create(GetAssetRequestSchema)` to create a new message.
 */
export const GetAssetRequestSchema: GenMessage<GetAssetRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 4);

/**
 * The request message for BatchGetAssets.
 *
 * @generated from message utila.api.v1alpha1.BatchGetAssetsRequest
 */
export type BatchGetAssetsRequest = Message<"utila.api.v1alpha1.BatchGetAssetsRequest"> & {
  /**
   * Repeated resource names of the requested assets.
   *
   * Format: `assets/{asset}`
   *
   * @generated from field: repeated string names = 1;
   */
  names: string[];
};

/**
 * Describes the message utila.api.v1alpha1.BatchGetAssetsRequest.
 * Use `create(BatchGetAssetsRequestSchema)` to create a new message.
 */
export const BatchGetAssetsRequestSchema: GenMessage<BatchGetAssetsRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 5);

/**
 * The response message for BatchGetAssets.
 *
 * @generated from message utila.api.v1alpha1.BatchGetAssetsResponse
 */
export type BatchGetAssetsResponse = Message<"utila.api.v1alpha1.BatchGetAssetsResponse"> & {
  /**
   * The assets returned.
   *
   * @generated from field: repeated utila.api.v1alpha1.Asset assets = 1;
   */
  assets: Asset[];
};

/**
 * Describes the message utila.api.v1alpha1.BatchGetAssetsResponse.
 * Use `create(BatchGetAssetsResponseSchema)` to create a new message.
 */
export const BatchGetAssetsResponseSchema: GenMessage<BatchGetAssetsResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 6);

/**
 * The request message for ListAssetsRequest.
 *
 * @generated from message utila.api.v1alpha1.ListAssetsRequest
 */
export type ListAssetsRequest = Message<"utila.api.v1alpha1.ListAssetsRequest"> & {
  /**
   * The maximum number of assets to return. The service may return fewer than
   * this value.
   *
   * Note: pagination is currently not supported.
   *
   * @generated from field: int32 page_size = 3;
   */
  pageSize: number;

  /**
   * A page token, received from a previous `ListAssets` call.
   *
   * Note: pagination is currently not supported.
   *
   * @generated from field: string page_token = 4;
   */
  pageToken: string;
};

/**
 * Describes the message utila.api.v1alpha1.ListAssetsRequest.
 * Use `create(ListAssetsRequestSchema)` to create a new message.
 */
export const ListAssetsRequestSchema: GenMessage<ListAssetsRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 7);

/**
 * The response message for ListAssets.
 *
 * @generated from message utila.api.v1alpha1.ListAssetsResponse
 */
export type ListAssetsResponse = Message<"utila.api.v1alpha1.ListAssetsResponse"> & {
  /**
   * The assets returned.
   *
   * @generated from field: repeated utila.api.v1alpha1.Asset assets = 1;
   */
  assets: Asset[];

  /**
   * A token to retrieve the next page of results. Pass this value in the
   * request to `ListAssets` as `page_token` to retrieve the next page.
   *
   * Note: pagination is currently not supported.
   *
   * @generated from field: string next_page_token = 2;
   */
  nextPageToken: string;
};

/**
 * Describes the message utila.api.v1alpha1.ListAssetsResponse.
 * Use `create(ListAssetsResponseSchema)` to create a new message.
 */
export const ListAssetsResponseSchema: GenMessage<ListAssetsResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_assets, 8);

/**
 * A service for interacting with Assets.
 *
 * @generated from service utila.api.v1alpha1.Assets
 */
export const Assets: GenService<{
  /**
   * GetAsset
   *
   * Retrieves an asset by resource name.
   *
   * @generated from rpc utila.api.v1alpha1.Assets.GetAsset
   */
  getAsset: {
    methodKind: "unary";
    input: typeof GetAssetRequestSchema;
    output: typeof AssetSchema;
  },
  /**
   * BatchGetAssets
   *
   * Retrieves a list of assets by resource name.
   *
   * @generated from rpc utila.api.v1alpha1.Assets.BatchGetAssets
   */
  batchGetAssets: {
    methodKind: "unary";
    input: typeof BatchGetAssetsRequestSchema;
    output: typeof BatchGetAssetsResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_utila_api_v1alpha1_assets, 0);

