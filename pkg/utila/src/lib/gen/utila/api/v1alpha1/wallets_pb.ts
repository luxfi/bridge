// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1alpha1/wallets.proto (package utila.api.v1alpha1, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_google_api_annotations } from "../../../google/api/annotations_pb";
import { file_google_api_client } from "../../../google/api/client_pb";
import { file_google_api_field_behavior } from "../../../google/api/field_behavior_pb";
import { file_google_api_resource } from "../../../google/api/resource_pb";
import { file_google_api_visibility } from "../../../google/api/visibility_pb";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { file_google_protobuf_descriptor, file_google_protobuf_field_mask } from "@bufbuild/protobuf/wkt";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../protoc-gen-openapiv2/options/annotations_pb";
import { file_utila_api_v1_api } from "../v1/api_pb";
import type { ConvertedValue } from "./types_pb";
import { file_utila_api_v1alpha1_types } from "./types_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1alpha1/wallets.proto.
 */
export const file_utila_api_v1alpha1_wallets: GenFile = /*@__PURE__*/
  fileDesc("CiB1dGlsYS9hcGkvdjFhbHBoYTEvd2FsbGV0cy5wcm90bxISdXRpbGEuYXBpLnYxYWxwaGExIs4DCgZXYWxsZXQSXgoEbmFtZRgBIAEoCUJQkkFJSioidmF1bHRzLzFiMjU2MzVhNWIzZi93YWxsZXRzLzk1MjU3YzVhNTIyZiLKPhr6AhduYW1lPXZhdWx0cy8qL3dhbGxldHMvKuJBAQMSLAoMZGlzcGxheV9uYW1lGAIgASgJQhaSQQ9KDSJEZUZpIHdhbGxldCLiQQECEiAKCGFyY2hpdmVkGAMgASgIQg6SQQdKBWZhbHNl4kEBARIWCghleHRlcm5hbBgGIAEoCEIE4kEBAxI6CglhZGRyZXNzZXMYBCADKAsyIS51dGlsYS5hcGkudjFhbHBoYTEuV2FsbGV0QWRkcmVzc0IE4kEBAxJBCg9jb252ZXJ0ZWRfdmFsdWUYBSABKAsyIi51dGlsYS5hcGkudjFhbHBoYTEuQ29udmVydGVkVmFsdWVCBOJBAQMiMQoEVmlldxIUChBWSUVXX1VOU1BFQ0lGSUVEEAASCQoFQkFTSUMQARIICgRGVUxMEAI6SupBRwoTYXBpLnV0aWxhLmlvL1dhbGxldBIfdmF1bHRzL3t2YXVsdH0vd2FsbGV0cy97d2FsbGV0fSoHd2FsbGV0czIGd2FsbGV0IucHCg1XYWxsZXRBZGRyZXNzElgKBG5hbWUYASABKAlCSpJBQ0pBInZhdWx0cy8xYjI1NjM1YTViM2Yvd2FsbGV0cy82N2FmNDQwMzE1ODQvYWRkcmVzc2VzLzUxOWM2N2RkYWUzMyLiQQEDEjAKDGRpc3BsYXlfbmFtZRgCIAEoCUIakkETShEiSGFsJ3MgQWRkcmVzcyAzIuJBAQESTQoHbmV0d29yaxgDIAEoCUI8kkEcShoibmV0d29ya3MvYml0Y29pbi1tYWlubmV0IuJBAQL6QRYKFGFwaS51dGlsYS5pby9OZXR3b3JrEkYKB2FkZHJlc3MYBCABKAlCNZJBLkosImJjMXEwNHB1bTU3ZW5tZmdjdTN0dTVnd3FsbXphNW43dGNoa3kwZ2p2dSLiQQEDEmIKDmFkZHJlc3NfZm9ybWF0GAUgASgOMi8udXRpbGEuYXBpLnYxYWxwaGExLldhbGxldEFkZHJlc3MuQWRkcmVzc0Zvcm1hdEIZkkESShAiQklUQ09JTl9QMldQS0gi4kEBAxJSCgNrZXkYBiABKAlCRZJBKUonInZhdWx0cy8xYjI1NjM1YTViM2Yva2V5cy85NTI1N2M1YTUyMmYi4kEBA/pBEgoQYXBpLnV0aWxhLmlvL0tleRI2ChNrZXlfZGVyaXZhdGlvbl9wYXRoGAcgAygDQhmSQRJKEFs0NCwgMCwgMCwgMCwgM13iQQEDEkgKBHR5cGUYCCABKA4yJi51dGlsYS5hcGkudjFhbHBoYTEuV2FsbGV0QWRkcmVzcy5UeXBlQhKSQQtKCSJERVBPU0lUIuJBAQMiuQEKDUFkZHJlc3NGb3JtYXQSHgoaQUREUkVTU19GT1JNQVRfVU5TUEVDSUZJRUQQABIRCg1CSVRDT0lOX1AyUEtIEAESEgoOQklUQ09JTl9QMldQS0gQAhIHCgNFVk0QAxIPCgtUUk9OX0JBU0U1OBAEEgoKBkJBU0U1OBAFEiMKDUNPU01PU19CRUNIMzIQBhoQ+tLkkwIKEghJTlRFUk5BTBIWChJUT05fTk9OX0JPVU5DRUFCTEUQByJHCgRUeXBlEhwKGEFERFJFU1NfVFlQRV9VTlNQRUNJRklFRBAAEggKBE1BSU4QARILCgdERVBPU0lUEAISCgoGQ0hBTkdFEAM6dOpBcQoaYXBpLnV0aWxhLmlvL1dhbGxldEFkZHJlc3MSM3ZhdWx0cy97dmF1bHR9L3dhbGxldHMve3dhbGxldH0vYWRkcmVzc2VzL3thZGRyZXNzfSoPd2FsbGV0QWRkcmVzc2VzMg13YWxsZXRBZGRyZXNzIqACChVHZW5lcmF0ZVdhbGxldFJlcXVlc3QSQgoGcGFyZW50GAEgASgJQjKSQRTKPhH6Ag52YXVsdD12YXVsdHMvKuJBAQL6QRQKEmFwaS51dGlsYS5pby9WYXVsdBJECgVpbnB1dBhjIAEoCzIvLnV0aWxhLmFwaS52MWFscGhhMS5HZW5lcmF0ZVdhbGxldFJlcXVlc3QuSW5wdXRCBOJBAQISMAoGd2FsbGV0GAIgASgLMhoudXRpbGEuYXBpLnYxYWxwaGExLldhbGxldEIE4kEBAhpLCgVJbnB1dBJCChFpbml0aWFsX2FkZHJlc3NlcxgBIAMoCzIhLnV0aWxhLmFwaS52MWFscGhhMS5XYWxsZXRBZGRyZXNzQgTiQQECIl4KEEdldFdhbGxldFJlcXVlc3QSSgoEbmFtZRgBIAEoCUI8kkEdyj4a+gIXbmFtZT12YXVsdHMvKi93YWxsZXRzLyriQQEC+kEVChNhcGkudXRpbGEuaW8vV2FsbGV0Iv0BChJMaXN0V2FsbGV0c1JlcXVlc3QSQwoGcGFyZW50GAEgASgJQjOSQRXKPhL6Ag9wYXJlbnQ9dmF1bHRzLyriQQEC+kEUChJhcGkudXRpbGEuaW8vVmF1bHQSMwoEdmlldxgCIAEoDjIfLnV0aWxhLmFwaS52MWFscGhhMS5XYWxsZXQuVmlld0IE4kEBARIUCgZmaWx0ZXIYAyABKAlCBOJBAQESFgoIb3JkZXJfYnkYBCABKAlCBOJBAQESFwoJcGFnZV9zaXplGAUgASgFQgTiQQEBEhgKCnBhZ2VfdG9rZW4YBiABKAlCBOJBAQESDAoEc2tpcBgHIAEoBSJvChNMaXN0V2FsbGV0c1Jlc3BvbnNlEisKB3dhbGxldHMYASADKAsyGi51dGlsYS5hcGkudjFhbHBoYTEuV2FsbGV0EhcKD25leHRfcGFnZV90b2tlbhgCIAEoCRISCgp0b3RhbF9zaXplGAMgASgFIn4KE1VwZGF0ZVdhbGxldFJlcXVlc3QSMAoGd2FsbGV0GAEgASgLMhoudXRpbGEuYXBpLnYxYWxwaGExLldhbGxldEIE4kEBAhI1Cgt1cGRhdGVfbWFzaxgCIAEoCzIaLmdvb2dsZS5wcm90b2J1Zi5GaWVsZE1hc2tCBOJBAQEirQEKGkNyZWF0ZVdhbGxldEFkZHJlc3NSZXF1ZXN0Ek4KBnBhcmVudBgBIAEoCUI+kkEfyj4c+gIZcGFyZW50PXZhdWx0cy8qL3dhbGxldHMvKuJBAQL6QRUKE2FwaS51dGlsYS5pby9XYWxsZXQSPwoOd2FsbGV0X2FkZHJlc3MYAiABKAsyIS51dGlsYS5hcGkudjFhbHBoYTEuV2FsbGV0QWRkcmVzc0IE4kEBAiJ4ChdHZXRXYWxsZXRBZGRyZXNzUmVxdWVzdBJdCgRuYW1lGAEgASgJQk+SQSnKPib6AiNuYW1lPXZhdWx0cy8qL3dhbGxldHMvKi9hZGRyZXNzZXMvKuJBAQL6QRwKGmFwaS51dGlsYS5pby9XYWxsZXRBZGRyZXNzIq0BChpMaXN0V2FsbGV0QWRkcmVzc2VzUmVxdWVzdBJOCgZwYXJlbnQYASABKAlCPpJBH8o+HPoCGXBhcmVudD12YXVsdHMvKi93YWxsZXRzLyriQQEC+kEVChNhcGkudXRpbGEuaW8vV2FsbGV0EhcKCXBhZ2Vfc2l6ZRgDIAEoBUIE4kEBARIYCgpwYWdlX3Rva2VuGAQgASgJQgTiQQEBEgwKBHNraXAYBSABKAUihwEKG0xpc3RXYWxsZXRBZGRyZXNzZXNSZXNwb25zZRISCgp0b3RhbF9zaXplGAEgASgFEjsKEHdhbGxldF9hZGRyZXNzZXMYAiADKAsyIS51dGlsYS5hcGkudjFhbHBoYTEuV2FsbGV0QWRkcmVzcxIXCg9uZXh0X3BhZ2VfdG9rZW4YAyABKAkyjQcKB1dhbGxldHMSsgEKDkdlbmVyYXRlV2FsbGV0EikudXRpbGEuYXBpLnYxYWxwaGExLkdlbmVyYXRlV2FsbGV0UmVxdWVzdBoaLnV0aWxhLmFwaS52MWFscGhhMS5XYWxsZXQiWdpBE3BhcmVudCxpbnB1dCx3YWxsZXSCtRgCCAGCtRgCCAKC0+STAjE6ASoiLC92MWFscGhhMS97cGFyZW50PXZhdWx0cy8qfS93YWxsZXRzOmdlbmVyYXRlEpQBCgtMaXN0V2FsbGV0cxImLnV0aWxhLmFwaS52MWFscGhhMS5MaXN0V2FsbGV0c1JlcXVlc3QaJy51dGlsYS5hcGkudjFhbHBoYTEuTGlzdFdhbGxldHNSZXNwb25zZSI02kEGcGFyZW50gtPkkwIlEiMvdjFhbHBoYTEve3BhcmVudD12YXVsdHMvKn0vd2FsbGV0cxLVAQoTQ3JlYXRlV2FsbGV0QWRkcmVzcxIuLnV0aWxhLmFwaS52MWFscGhhMS5DcmVhdGVXYWxsZXRBZGRyZXNzUmVxdWVzdBohLnV0aWxhLmFwaS52MWFscGhhMS5XYWxsZXRBZGRyZXNzImvaQRVwYXJlbnQsd2FsbGV0X2FkZHJlc3OCtRgCCAGCtRgCCAKC0+STAkE6DndhbGxldF9hZGRyZXNzIi8vdjFhbHBoYTEve3BhcmVudD12YXVsdHMvKi93YWxsZXRzLyp9L2FkZHJlc3NlcxKiAQoQR2V0V2FsbGV0QWRkcmVzcxIrLnV0aWxhLmFwaS52MWFscGhhMS5HZXRXYWxsZXRBZGRyZXNzUmVxdWVzdBohLnV0aWxhLmFwaS52MWFscGhhMS5XYWxsZXRBZGRyZXNzIj7aQQRuYW1lgtPkkwIxEi8vdjFhbHBoYTEve25hbWU9dmF1bHRzLyovd2FsbGV0cy8qL2FkZHJlc3Nlcy8qfRK4AQoTTGlzdFdhbGxldEFkZHJlc3NlcxIuLnV0aWxhLmFwaS52MWFscGhhMS5MaXN0V2FsbGV0QWRkcmVzc2VzUmVxdWVzdBovLnV0aWxhLmFwaS52MWFscGhhMS5MaXN0V2FsbGV0QWRkcmVzc2VzUmVzcG9uc2UiQNpBBnBhcmVudILT5JMCMRIvL3YxYWxwaGExL3twYXJlbnQ9dmF1bHRzLyovd2FsbGV0cy8qfS9hZGRyZXNzZXNCJFoidXRpbGEuaW8vZ2VucHJvdG8vYXBpL3YxYWxwaGExO2FwaWIGcHJvdG8z", [file_google_api_annotations, file_google_api_client, file_google_api_field_behavior, file_google_api_resource, file_google_api_visibility, file_google_protobuf_descriptor, file_google_protobuf_field_mask, file_protoc_gen_openapiv2_options_annotations, file_utila_api_v1_api, file_utila_api_v1alpha1_types]);

/**
 * A wallet is a resource containing multiple addresses on different blockchains.
 * Addresses can be generated from different MPC keys and stored in a single wallet.
 *
 * @generated from message utila.api.v1alpha1.Wallet
 */
export type Wallet = Message<"utila.api.v1alpha1.Wallet"> & {
  /**
   * The resource name of the wallet.
   *
   * Format: `vaults/{vault}/wallets/{wallet}`
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * A human-readable name.
   *
   * Must match the regular expression `[a-zA-Z0-9\.,:\-'# _$]+$` and be shorter than 100 characters
   *
   * @generated from field: string display_name = 2;
   */
  displayName: string;

  /**
   * Whether this wallet is archived.
   *
   * Archived wallets are not returned by default in `ListWallets` and are not shown in the UI.
   *
   * @generated from field: bool archived = 3;
   */
  archived: boolean;

  /**
   * Whether this wallet is external.
   *
   * External wallets are wallets that are not managed by Utila.
   *
   * @generated from field: bool external = 6;
   */
  external: boolean;

  /**
   * The addresses that belong to this wallet.
   *
   * Change addresses of UTXO-based blockchains are not included.
   *
   * A maximum of 100 addresses are returned.
   *
   * Always returned for `GetWallet` and `CreateWallet`.
   * For `ListWallets`, it is only returned when the `view` field is set to `FULL`.
   *
   * @generated from field: repeated utila.api.v1alpha1.WalletAddress addresses = 4;
   */
  addresses: WalletAddress[];

  /**
   * The converted value of all assets in this Wallet.
   *
   * Note: this is an estimate, and may be out of date.
   *
   * @generated from field: utila.api.v1alpha1.ConvertedValue converted_value = 5;
   */
  convertedValue?: ConvertedValue;
};

/**
 * Describes the message utila.api.v1alpha1.Wallet.
 * Use `create(WalletSchema)` to create a new message.
 */
export const WalletSchema: GenMessage<Wallet> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 0);

/**
 * Enum to control the amount of data returned for a wallet.
 *
 * @generated from enum utila.api.v1alpha1.Wallet.View
 */
export enum Wallet_View {
  /**
   * The default / unset value.
   * Defaults to the BASIC view for `GetWallet` and `CreateWallet`.
   * Defaults to the FULL view for `ListWallets`.
   *
   * @generated from enum value: VIEW_UNSPECIFIED = 0;
   */
  VIEW_UNSPECIFIED = 0,

  /**
   * Includes only the wallet name and display name.
   *
   * @generated from enum value: BASIC = 1;
   */
  BASIC = 1,

  /**
   * Includes all wallet addresses (except change addresses in UTXO-based blockchains) and estimated total value sum.
   *
   * @generated from enum value: FULL = 2;
   */
  FULL = 2,
}

/**
 * Describes the enum utila.api.v1alpha1.Wallet.View.
 */
export const Wallet_ViewSchema: GenEnum<Wallet_View> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_wallets, 0, 0);

/**
 * A Wallet is a secure workspace for storing MPC keys and managing user access.
 *
 * @generated from message utila.api.v1alpha1.WalletAddress
 */
export type WalletAddress = Message<"utila.api.v1alpha1.WalletAddress"> & {
  /**
   * The resource name of the WalletAddress.
   *
   * Format: `vaults/{vault}/wallets/{wallet}/addresses/{address}`
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * A human-readable name.
   *
   * Must match the regular expression `[a-zA-Z0-9\.,:\-'# _$]+$` and be shorter than 100 characters
   *
   * @generated from field: string display_name = 2;
   */
  displayName: string;

  /**
   * The resource name of the network of the address.
   *
   * Format: `networks/{network}`
   *
   * @generated from field: string network = 3;
   */
  network: string;

  /**
   * The blockchain address.
   *
   * @generated from field: string address = 4;
   */
  address: string;

  /**
   * Optional. Address format.
   *
   * @generated from field: utila.api.v1alpha1.WalletAddress.AddressFormat address_format = 5;
   */
  addressFormat: WalletAddress_AddressFormat;

  /**
   * The resource name of the MPC key this address was derived from.
   *
   * Format: `vaults/{vault}/keys/{key}`
   *
   * @generated from field: string key = 6;
   */
  key: string;

  /**
   * Derivation path of the address from the MPC key.
   *
   * @generated from field: repeated int64 key_derivation_path = 7;
   */
  keyDerivationPath: bigint[];

  /**
   * @generated from field: utila.api.v1alpha1.WalletAddress.Type type = 8;
   */
  type: WalletAddress_Type;
};

/**
 * Describes the message utila.api.v1alpha1.WalletAddress.
 * Use `create(WalletAddressSchema)` to create a new message.
 */
export const WalletAddressSchema: GenMessage<WalletAddress> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 1);

/**
 * Address format.
 *
 * @generated from enum utila.api.v1alpha1.WalletAddress.AddressFormat
 */
export enum WalletAddress_AddressFormat {
  /**
   * Default value. This value is unused.
   *
   * @generated from enum value: ADDRESS_FORMAT_UNSPECIFIED = 0;
   */
  ADDRESS_FORMAT_UNSPECIFIED = 0,

  /**
   * Bitcoin P2PKH address format.
   *
   * @generated from enum value: BITCOIN_P2PKH = 1;
   */
  BITCOIN_P2PKH = 1,

  /**
   * Bitcoin P2WPKH address format.
   *
   * @generated from enum value: BITCOIN_P2WPKH = 2;
   */
  BITCOIN_P2WPKH = 2,

  /**
   * Ethereum address format.
   *
   * @generated from enum value: EVM = 3;
   */
  EVM = 3,

  /**
   * Tron base58 address format.
   *
   * @generated from enum value: TRON_BASE58 = 4;
   */
  TRON_BASE58 = 4,

  /**
   * Solana address format.
   *
   * @generated from enum value: BASE58 = 5;
   */
  BASE58 = 5,

  /**
   * Cosmos address format.
   *
   * @generated from enum value: COSMOS_BECH32 = 6;
   */
  COSMOS_BECH32 = 6,

  /**
   * Ton address format.
   *
   * @generated from enum value: TON_NON_BOUNCEABLE = 7;
   */
  TON_NON_BOUNCEABLE = 7,
}

/**
 * Describes the enum utila.api.v1alpha1.WalletAddress.AddressFormat.
 */
export const WalletAddress_AddressFormatSchema: GenEnum<WalletAddress_AddressFormat> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_wallets, 1, 0);

/**
 * @generated from enum utila.api.v1alpha1.WalletAddress.Type
 */
export enum WalletAddress_Type {
  /**
   * Default value. This value is unused.
   *
   * @generated from enum value: ADDRESS_TYPE_UNSPECIFIED = 0;
   */
  ADDRESS_TYPE_UNSPECIFIED = 0,

  /**
   * Main address (main address of the wallet).
   *
   * @generated from enum value: MAIN = 1;
   */
  MAIN = 1,

  /**
   * Deposit address.
   *
   * @generated from enum value: DEPOSIT = 2;
   */
  DEPOSIT = 2,

  /**
   * Change address.
   *
   * @generated from enum value: CHANGE = 3;
   */
  CHANGE = 3,
}

/**
 * Describes the enum utila.api.v1alpha1.WalletAddress.Type.
 */
export const WalletAddress_TypeSchema: GenEnum<WalletAddress_Type> = /*@__PURE__*/
  enumDesc(file_utila_api_v1alpha1_wallets, 1, 1);

/**
 * The request message for GenerateWallet.
 *
 * @generated from message utila.api.v1alpha1.GenerateWalletRequest
 */
export type GenerateWalletRequest = Message<"utila.api.v1alpha1.GenerateWalletRequest"> & {
  /**
   * The parent vault resource where this wallet will be created.
   *
   * Format: `vaults/{vault}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * Additional input to create the wallet.
   *
   * @generated from field: utila.api.v1alpha1.GenerateWalletRequest.Input input = 99;
   */
  input?: GenerateWalletRequest_Input;

  /**
   * The wallet resource to create.
   *
   * @generated from field: utila.api.v1alpha1.Wallet wallet = 2;
   */
  wallet?: Wallet;
};

/**
 * Describes the message utila.api.v1alpha1.GenerateWalletRequest.
 * Use `create(GenerateWalletRequestSchema)` to create a new message.
 */
export const GenerateWalletRequestSchema: GenMessage<GenerateWalletRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 2);

/**
 * Additional input message.
 *
 * @generated from message utila.api.v1alpha1.GenerateWalletRequest.Input
 */
export type GenerateWalletRequest_Input = Message<"utila.api.v1alpha1.GenerateWalletRequest.Input"> & {
  /**
   * The initial wallet addresses to create within the wallet.
   * Must at least supply one address.
   *
   * See `CreateWalletAddress` for more information.
   *
   * @generated from field: repeated utila.api.v1alpha1.WalletAddress initial_addresses = 1;
   */
  initialAddresses: WalletAddress[];
};

/**
 * Describes the message utila.api.v1alpha1.GenerateWalletRequest.Input.
 * Use `create(GenerateWalletRequest_InputSchema)` to create a new message.
 */
export const GenerateWalletRequest_InputSchema: GenMessage<GenerateWalletRequest_Input> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 2, 0);

/**
 * The request message for GetWallet.
 *
 * @generated from message utila.api.v1alpha1.GetWalletRequest
 */
export type GetWalletRequest = Message<"utila.api.v1alpha1.GetWalletRequest"> & {
  /**
   * The resource name of the wallet.
   *
   * Format: `vaults/{vault}/wallets/{wallet}`
   *
   * @generated from field: string name = 1;
   */
  name: string;
};

/**
 * Describes the message utila.api.v1alpha1.GetWalletRequest.
 * Use `create(GetWalletRequestSchema)` to create a new message.
 */
export const GetWalletRequestSchema: GenMessage<GetWalletRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 3);

/**
 * The request message for ListWallets.
 *
 * @generated from message utila.api.v1alpha1.ListWalletsRequest
 */
export type ListWalletsRequest = Message<"utila.api.v1alpha1.ListWalletsRequest"> & {
  /**
   * The parent vault resource whose wallets are to be listed.
   *
   * Format: `vaults/{vault}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * Specify the wallet view to make a partial list request.
   *
   * @generated from field: utila.api.v1alpha1.Wallet.View view = 2;
   */
  view: Wallet_View;

  /**
   * Filter results using EBNF syntax.
   *
   * Supported fields:
   * * `displayName` (with regex support)
   * * `createTime`
   * * `external`
   * * `convertedValue.amount`
   *
   * Examples:
   * - `displayName = "My Wallet"` (All wallets with the display name "My Wallet")
   * - `regex(displayName, "^My ")` (All wallets with names starting with "My ")
   * - `regex(displayName, "(?i)^mY ")` (All wallets with names starting with "My ", case insensitive)
   * - `external`, `-external`, `NOT external`
   * - `createTime > "2023-08-29T18:04:00Z"`
   * - `createTime > "2023-08-29T18:04:00Z" AND displayName = "My Wallet"`
   *
   * @generated from field: string filter = 3;
   */
  filter: string;

  /**
   * SQL-like ordering specifications.
   * Supports the fields `display_name`, `create_time`, `update_time`, and `converted_value.amount`.
   *
   * @generated from field: string order_by = 4;
   */
  orderBy: string;

  /**
   * The maximum number of items to return. The service may return fewer than
   * this value.
   *
   * If unspecified, at most 50 will be returned.
   * The maximum value is 1000; values above 1000 will be coerced to 1000.
   *
   * @generated from field: int32 page_size = 5;
   */
  pageSize: number;

  /**
   * A page token, received from the previous list call as `nextPageToken`.
   * Provide this to retrieve the subsequent page.
   *
   * When paginating, all other parameters must match the call that provided
   * the page token.
   *
   * @generated from field: string page_token = 6;
   */
  pageToken: string;

  /**
   * How many results to skip.
   *
   * Note: may be used alongside token-based pagination (see `pageToken`),
   * although this won't be needed for most use cases.
   *
   * @generated from field: int32 skip = 7;
   */
  skip: number;
};

/**
 * Describes the message utila.api.v1alpha1.ListWalletsRequest.
 * Use `create(ListWalletsRequestSchema)` to create a new message.
 */
export const ListWalletsRequestSchema: GenMessage<ListWalletsRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 4);

/**
 * The response message for ListWallets.
 *
 * @generated from message utila.api.v1alpha1.ListWalletsResponse
 */
export type ListWalletsResponse = Message<"utila.api.v1alpha1.ListWalletsResponse"> & {
  /**
   * The wallets returned.
   *
   * @generated from field: repeated utila.api.v1alpha1.Wallet wallets = 1;
   */
  wallets: Wallet[];

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
};

/**
 * Describes the message utila.api.v1alpha1.ListWalletsResponse.
 * Use `create(ListWalletsResponseSchema)` to create a new message.
 */
export const ListWalletsResponseSchema: GenMessage<ListWalletsResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 5);

/**
 * The request message for UpdateWallet.
 *
 * @generated from message utila.api.v1alpha1.UpdateWalletRequest
 */
export type UpdateWalletRequest = Message<"utila.api.v1alpha1.UpdateWalletRequest"> & {
  /**
   * The wallet resource to update.
   *
   * @generated from field: utila.api.v1alpha1.Wallet wallet = 1;
   */
  wallet?: Wallet;

  /**
   * The update mask applies to the resource. For the `FieldMask` definition,
   * see
   * https://protobuf.dev/reference/protobuf/google.protobuf/#field-masks-updates
   *
   * @generated from field: google.protobuf.FieldMask update_mask = 2;
   */
  updateMask?: FieldMask;
};

/**
 * Describes the message utila.api.v1alpha1.UpdateWalletRequest.
 * Use `create(UpdateWalletRequestSchema)` to create a new message.
 */
export const UpdateWalletRequestSchema: GenMessage<UpdateWalletRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 6);

/**
 * The request message for GenerateAddress.
 *
 * @generated from message utila.api.v1alpha1.CreateWalletAddressRequest
 */
export type CreateWalletAddressRequest = Message<"utila.api.v1alpha1.CreateWalletAddressRequest"> & {
  /**
   * The parent wallet resource where this wallet address will be created.
   *
   * Format: `vaults/{vault}/wallets/{wallet}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * The wallet address resource to create.
   *
   * @generated from field: utila.api.v1alpha1.WalletAddress wallet_address = 2;
   */
  walletAddress?: WalletAddress;
};

/**
 * Describes the message utila.api.v1alpha1.CreateWalletAddressRequest.
 * Use `create(CreateWalletAddressRequestSchema)` to create a new message.
 */
export const CreateWalletAddressRequestSchema: GenMessage<CreateWalletAddressRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 7);

/**
 * The request message for GetWalletAddress.
 *
 * @generated from message utila.api.v1alpha1.GetWalletAddressRequest
 */
export type GetWalletAddressRequest = Message<"utila.api.v1alpha1.GetWalletAddressRequest"> & {
  /**
   * The resource name of the wallet address.
   *
   * Format: `vaults/{vault}/wallets/{wallet}/addresses/{address}`
   *
   * @generated from field: string name = 1;
   */
  name: string;
};

/**
 * Describes the message utila.api.v1alpha1.GetWalletAddressRequest.
 * Use `create(GetWalletAddressRequestSchema)` to create a new message.
 */
export const GetWalletAddressRequestSchema: GenMessage<GetWalletAddressRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 8);

/**
 * The request message for ListWalletAddresses.
 *
 * @generated from message utila.api.v1alpha1.ListWalletAddressesRequest
 */
export type ListWalletAddressesRequest = Message<"utila.api.v1alpha1.ListWalletAddressesRequest"> & {
  /**
   * The wallet whose addresses are to be listed.
   *
   * Format: `vaults/{vault}/wallets/{wallet}`
   *
   * @generated from field: string parent = 1;
   */
  parent: string;

  /**
   * The maximum number of items to return. The service may return fewer than this value.
   *
   * If unspecified, at most 50 will be returned. The maximum value is 1000; values above 1000 will be coerced to 1000.
   *
   * @generated from field: int32 page_size = 3;
   */
  pageSize: number;

  /**
   * A page token, received from the previous list call as `nextPageToken`.
   *
   * @generated from field: string page_token = 4;
   */
  pageToken: string;

  /**
   * How many results to skip.
   *
   * Note: may be used alongside token-based pagination (see `pageToken`),
   * although this won't be needed for most use cases.
   *
   * @generated from field: int32 skip = 5;
   */
  skip: number;
};

/**
 * Describes the message utila.api.v1alpha1.ListWalletAddressesRequest.
 * Use `create(ListWalletAddressesRequestSchema)` to create a new message.
 */
export const ListWalletAddressesRequestSchema: GenMessage<ListWalletAddressesRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 9);

/**
 * The response message for ListAddresses.
 *
 * @generated from message utila.api.v1alpha1.ListWalletAddressesResponse
 */
export type ListWalletAddressesResponse = Message<"utila.api.v1alpha1.ListWalletAddressesResponse"> & {
  /**
   * Total number of items in the response, regardless of pagination.
   *
   * @generated from field: int32 total_size = 1;
   */
  totalSize: number;

  /**
   * The addresses returned.
   *
   * @generated from field: repeated utila.api.v1alpha1.WalletAddress wallet_addresses = 2;
   */
  walletAddresses: WalletAddress[];

  /**
   * A token, which can be sent as `pageToken` to retrieve the next page.
   * If this field is omitted, there are no subsequent pages.
   *
   * @generated from field: string next_page_token = 3;
   */
  nextPageToken: string;
};

/**
 * Describes the message utila.api.v1alpha1.ListWalletAddressesResponse.
 * Use `create(ListWalletAddressesResponseSchema)` to create a new message.
 */
export const ListWalletAddressesResponseSchema: GenMessage<ListWalletAddressesResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_wallets, 10);

/**
 * A service for interacting with wallets.
 *
 * @generated from service utila.api.v1alpha1.Wallets
 */
export const Wallets: GenService<{
  /**
   * GenerateWallet
   *
   * Create a new wallet.
   *
   * @generated from rpc utila.api.v1alpha1.Wallets.GenerateWallet
   */
  generateWallet: {
    methodKind: "unary";
    input: typeof GenerateWalletRequestSchema;
    output: typeof WalletSchema;
  },
  /**
   * GetWallet
   *
   * Retrieve a wallet by resource name.
   *
   * @generated from rpc utila.api.v1alpha1.Wallets.ListWallets
   */
  listWallets: {
    methodKind: "unary";
    input: typeof ListWalletsRequestSchema;
    output: typeof ListWalletsResponseSchema;
  },
  /**
   * ListWallets
   *
   * Retrieve a list of all wallets in a vault.
   *
   * @generated from rpc utila.api.v1alpha1.Wallets.CreateWalletAddress
   */
  createWalletAddress: {
    methodKind: "unary";
    input: typeof CreateWalletAddressRequestSchema;
    output: typeof WalletAddressSchema;
  },
  /**
   * UpdateWallet
   *
   * Update a wallet.
   *
   * @generated from rpc utila.api.v1alpha1.Wallets.GetWalletAddress
   */
  getWalletAddress: {
    methodKind: "unary";
    input: typeof GetWalletAddressRequestSchema;
    output: typeof WalletAddressSchema;
  },
  /**
   * CreateWalletAddress
   *
   * Generates a new address in a wallet for the specificied blockchain network.
   *
   * The address is derived from the appropriate MPC key that is used by that blockchain,
   * i.e. ECDSA for Bitcoin and Ethereum, and EdDSA for Solana.
   * The MPC key will be selected automatically for you. If a key is not available,
   * an error will be returned.
   *
   * Currently, creation of multiple addresses is supported only for UTXO-based blockchains.
   *
   * Addresses in the EVM protocol family (Ethereum, Binance Smart Chain, etc.) generated in
   * the same wallet will share the same address. This abstraction is useful for DeFi applications,
   * where identical addresses are used across multiple blockchains.
   *
   * @generated from rpc utila.api.v1alpha1.Wallets.ListWalletAddresses
   */
  listWalletAddresses: {
    methodKind: "unary";
    input: typeof ListWalletAddressesRequestSchema;
    output: typeof ListWalletAddressesResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_utila_api_v1alpha1_wallets, 0);

