// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1/webhook_provider.proto (package utila.api.v1, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_google_api_annotations } from "../../../google/api/annotations_pb";
import { file_google_api_client } from "../../../google/api/client_pb";
import { file_google_api_field_behavior } from "../../../google/api/field_behavior_pb";
import { file_google_api_resource } from "../../../google/api/resource_pb";
import { file_google_api_visibility } from "../../../google/api/visibility_pb";
import type { EmptySchema, Timestamp } from "@bufbuild/protobuf/wkt";
import { file_google_protobuf_descriptor, file_google_protobuf_empty, file_google_protobuf_timestamp } from "@bufbuild/protobuf/wkt";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../protoc-gen-openapiv2/options/annotations_pb";
import type { User } from "./api_pb";
import { file_utila_api_v1_api } from "./api_pb";
import { file_utila_api_v1_transactions } from "./transactions_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1/webhook_provider.proto.
 */
export const file_utila_api_v1_webhook_provider: GenFile = /*@__PURE__*/
  fileDesc("CiN1dGlsYS9hcGkvdjEvd2ViaG9va19wcm92aWRlci5wcm90bxIMdXRpbGEuYXBpLnYxIv0BCgxXZWJob29rRXZlbnQajQEKBFR5cGUihAEKBEVudW0SFAoQRU5VTV9VTlNQRUNJRklFRBAAEhcKE1RSQU5TQUNUSU9OX0NSRUFURUQQAhIdChlUUkFOU0FDVElPTl9TVEFURV9VUERBVEVEEAMSEgoOV0FMTEVUX0NSRUFURUQQBBIaChZXQUxMRVRfQUREUkVTU19DUkVBVEVEEAUaXQoMUmVzb3VyY2VUeXBlIk0KBEVudW0SFAoQRU5VTV9VTlNQRUNJRklFRBAAEg8KC1RSQU5TQUNUSU9OEAESCgoGV0FMTEVUEAISEgoOV0FMTEVUX0FERFJFU1MQAyKQAgoHV2ViaG9vaxIWCgh2YXVsdF9pZBgBIAEoCUIE4kEBAxIQCgJpZBgCIAEoCUIE4kEBAxIaCgxkaXNwbGF5X25hbWUYAyABKAlCBOJBAQISGgoMZW5kcG9pbnRfdXJsGAQgASgJQgTiQQECEiwKCmNyZWF0ZWRfYnkYBSABKAsyEi51dGlsYS5hcGkudjEuVXNlckIE4kEBAxI0CgpjcmVhdGVkX2F0GAYgASgLMhouZ29vZ2xlLnByb3RvYnVmLlRpbWVzdGFtcEIE4kEBAxI/CgtldmVudF90eXBlcxgHIAMoDjIkLnV0aWxhLmFwaS52MS5XZWJob29rRXZlbnQuVHlwZS5FbnVtQgTiQQEBIl8KFENyZWF0ZVdlYmhvb2tSZXF1ZXN0EhkKCHZhdWx0X2lkGNTUvWkgASgJQgTiQQECEiwKB3dlYmhvb2sYASABKAsyFS51dGlsYS5hcGkudjEuV2ViaG9va0IE4kEBAiIwChNMaXN0V2ViaG9va3NSZXF1ZXN0EhkKCHZhdWx0X2lkGNTUvWkgASgJQgTiQQECIj8KFExpc3RXZWJob29rc1Jlc3BvbnNlEicKCHdlYmhvb2tzGAEgAygLMhUudXRpbGEuYXBpLnYxLldlYmhvb2siSwoURGVsZXRlV2ViaG9va1JlcXVlc3QSGQoIdmF1bHRfaWQY1NS9aSABKAlCBOJBAQISGAoKd2ViaG9va19pZBgBIAEoCUIE4kEBAiJMChNUZXN0RW5kcG9pbnRSZXF1ZXN0EhkKCHZhdWx0X2lkGNTUvWkgASgJQgTiQQECEhoKDGVuZHBvaW50X3VybBgBIAEoCUIE4kEBAiI4ChRUZXN0RW5kcG9pbnRSZXNwb25zZRIPCgdzdWNjZXNzGAEgASgIEg8KB2RldGFpbHMYAiABKAkiJQojR2V0V2ViaG9va1NpZ25hdHVyZVB1YmxpY0tleVJlcXVlc3QiOgokR2V0V2ViaG9va1NpZ25hdHVyZVB1YmxpY0tleVJlc3BvbnNlEhIKCnB1YmxpY19rZXkYASABKAkyigQKD1dlYmhvb2tQcm92aWRlchJSCg1DcmVhdGVXZWJob29rEiIudXRpbGEuYXBpLnYxLkNyZWF0ZVdlYmhvb2tSZXF1ZXN0GhUudXRpbGEuYXBpLnYxLldlYmhvb2siBoK1GAIIARJdCgxMaXN0V2ViaG9va3MSIS51dGlsYS5hcGkudjEuTGlzdFdlYmhvb2tzUmVxdWVzdBoiLnV0aWxhLmFwaS52MS5MaXN0V2ViaG9va3NSZXNwb25zZSIGgrUYAggBElMKDURlbGV0ZVdlYmhvb2sSIi51dGlsYS5hcGkudjEuRGVsZXRlV2ViaG9va1JlcXVlc3QaFi5nb29nbGUucHJvdG9idWYuRW1wdHkiBoK1GAIIARJdCgxUZXN0RW5kcG9pbnQSIS51dGlsYS5hcGkudjEuVGVzdEVuZHBvaW50UmVxdWVzdBoiLnV0aWxhLmFwaS52MS5UZXN0RW5kcG9pbnRSZXNwb25zZSIGgrUYAggBEo8BChxHZXRXZWJob29rU2lnbmF0dXJlUHVibGljS2V5EjEudXRpbGEuYXBpLnYxLkdldFdlYmhvb2tTaWduYXR1cmVQdWJsaWNLZXlSZXF1ZXN0GjIudXRpbGEuYXBpLnYxLkdldFdlYmhvb2tTaWduYXR1cmVQdWJsaWNLZXlSZXNwb25zZSIIgrUYAIi1GAFCHlocdXRpbGEuaW8vZ2VucHJvdG8vYXBpL3YxO2FwaWIGcHJvdG8z", [file_google_api_annotations, file_google_api_client, file_google_api_field_behavior, file_google_api_resource, file_google_api_visibility, file_google_protobuf_descriptor, file_google_protobuf_empty, file_google_protobuf_timestamp, file_protoc_gen_openapiv2_options_annotations, file_utila_api_v1_api, file_utila_api_v1_transactions]);

/**
 * The webhook event.
 * The type of event and the resource type.
 * Duplicated and sanitized from unrelevant entries from v1alpha1 API.
 *
 * @generated from message utila.api.v1.WebhookEvent
 */
export type WebhookEvent = Message<"utila.api.v1.WebhookEvent"> & {
};

/**
 * Describes the message utila.api.v1.WebhookEvent.
 * Use `create(WebhookEventSchema)` to create a new message.
 */
export const WebhookEventSchema: GenMessage<WebhookEvent> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 0);

/**
 * Namespace wrapper for enum.
 *
 * @generated from message utila.api.v1.WebhookEvent.Type
 */
export type WebhookEvent_Type = Message<"utila.api.v1.WebhookEvent.Type"> & {
};

/**
 * Describes the message utila.api.v1.WebhookEvent.Type.
 * Use `create(WebhookEvent_TypeSchema)` to create a new message.
 */
export const WebhookEvent_TypeSchema: GenMessage<WebhookEvent_Type> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 0, 0);

/**
 * The event type.
 *
 * @generated from enum utila.api.v1.WebhookEvent.Type.Enum
 */
export enum WebhookEvent_Type_Enum {
  /**
   * Unspecified event type.
   *
   * @generated from enum value: ENUM_UNSPECIFIED = 0;
   */
  ENUM_UNSPECIFIED = 0,

  /**
   * Transaction created.
   *
   * @generated from enum value: TRANSACTION_CREATED = 2;
   */
  TRANSACTION_CREATED = 2,

  /**
   * Transaction state updated.
   *
   * @generated from enum value: TRANSACTION_STATE_UPDATED = 3;
   */
  TRANSACTION_STATE_UPDATED = 3,

  /**
   * Wallet created.
   *
   * @generated from enum value: WALLET_CREATED = 4;
   */
  WALLET_CREATED = 4,

  /**
   * Wallet address created.
   *
   * @generated from enum value: WALLET_ADDRESS_CREATED = 5;
   */
  WALLET_ADDRESS_CREATED = 5,
}

/**
 * Describes the enum utila.api.v1.WebhookEvent.Type.Enum.
 */
export const WebhookEvent_Type_EnumSchema: GenEnum<WebhookEvent_Type_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1_webhook_provider, 0, 0, 0);

/**
 * Namespace wrapper for enum.
 *
 * @generated from message utila.api.v1.WebhookEvent.ResourceType
 */
export type WebhookEvent_ResourceType = Message<"utila.api.v1.WebhookEvent.ResourceType"> & {
};

/**
 * Describes the message utila.api.v1.WebhookEvent.ResourceType.
 * Use `create(WebhookEvent_ResourceTypeSchema)` to create a new message.
 */
export const WebhookEvent_ResourceTypeSchema: GenMessage<WebhookEvent_ResourceType> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 0, 1);

/**
 * The resource type.
 *
 * @generated from enum utila.api.v1.WebhookEvent.ResourceType.Enum
 */
export enum WebhookEvent_ResourceType_Enum {
  /**
   * Unspecified resource type.
   *
   * @generated from enum value: ENUM_UNSPECIFIED = 0;
   */
  ENUM_UNSPECIFIED = 0,

  /**
   * Transaction type.
   *
   * @generated from enum value: TRANSACTION = 1;
   */
  TRANSACTION = 1,

  /**
   * Wallet type.
   *
   * @generated from enum value: WALLET = 2;
   */
  WALLET = 2,

  /**
   * Wallet address type.
   *
   * @generated from enum value: WALLET_ADDRESS = 3;
   */
  WALLET_ADDRESS = 3,
}

/**
 * Describes the enum utila.api.v1.WebhookEvent.ResourceType.Enum.
 */
export const WebhookEvent_ResourceType_EnumSchema: GenEnum<WebhookEvent_ResourceType_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1_webhook_provider, 0, 1, 0);

/**
 * A webhook.
 *
 * @generated from message utila.api.v1.Webhook
 */
export type Webhook = Message<"utila.api.v1.Webhook"> & {
  /**
   * The vault id.
   * protolint:ignore:magic_ordinal // Not a request message.
   *
   * @generated from field: string vault_id = 1;
   */
  vaultId: string;

  /**
   * The webhook id.
   *
   * @generated from field: string id = 2;
   */
  id: string;

  /**
   * A human-readable name.
   *
   * @generated from field: string display_name = 3;
   */
  displayName: string;

  /**
   * The endpoint URL of the webhook.
   *
   * @generated from field: string endpoint_url = 4;
   */
  endpointUrl: string;

  /**
   * The user that created the webhook.
   *
   * @generated from field: utila.api.v1.User created_by = 5;
   */
  createdBy?: User;

  /**
   * The webhook creation time.
   *
   * @generated from field: google.protobuf.Timestamp created_at = 6;
   */
  createdAt?: Timestamp;

  /**
   * The webhook event types. If none provided, all events will be sent.
   *
   * @generated from field: repeated utila.api.v1.WebhookEvent.Type.Enum event_types = 7;
   */
  eventTypes: WebhookEvent_Type_Enum[];
};

/**
 * Describes the message utila.api.v1.Webhook.
 * Use `create(WebhookSchema)` to create a new message.
 */
export const WebhookSchema: GenMessage<Webhook> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 1);

/**
 * The request message for CreateWebhook.
 *
 * @generated from message utila.api.v1.CreateWebhookRequest
 */
export type CreateWebhookRequest = Message<"utila.api.v1.CreateWebhookRequest"> & {
  /**
   * The vault in which the webhook will be created.
   *
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;

  /**
   * The webhook to create.
   *
   * @generated from field: utila.api.v1.Webhook webhook = 1;
   */
  webhook?: Webhook;
};

/**
 * Describes the message utila.api.v1.CreateWebhookRequest.
 * Use `create(CreateWebhookRequestSchema)` to create a new message.
 */
export const CreateWebhookRequestSchema: GenMessage<CreateWebhookRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 2);

/**
 * The request message for ListWebhooks.
 *
 * @generated from message utila.api.v1.ListWebhooksRequest
 */
export type ListWebhooksRequest = Message<"utila.api.v1.ListWebhooksRequest"> & {
  /**
   * The vault whose webhooks are to be listed.
   *
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;
};

/**
 * Describes the message utila.api.v1.ListWebhooksRequest.
 * Use `create(ListWebhooksRequestSchema)` to create a new message.
 */
export const ListWebhooksRequestSchema: GenMessage<ListWebhooksRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 3);

/**
 * The response message for ListWebhooks.
 *
 * @generated from message utila.api.v1.ListWebhooksResponse
 */
export type ListWebhooksResponse = Message<"utila.api.v1.ListWebhooksResponse"> & {
  /**
   * The webhooks returned.
   *
   * @generated from field: repeated utila.api.v1.Webhook webhooks = 1;
   */
  webhooks: Webhook[];
};

/**
 * Describes the message utila.api.v1.ListWebhooksResponse.
 * Use `create(ListWebhooksResponseSchema)` to create a new message.
 */
export const ListWebhooksResponseSchema: GenMessage<ListWebhooksResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 4);

/**
 * The request message for DeleteWebhookRequest.
 *
 * @generated from message utila.api.v1.DeleteWebhookRequest
 */
export type DeleteWebhookRequest = Message<"utila.api.v1.DeleteWebhookRequest"> & {
  /**
   * The vault id of the webhook to delete.
   *
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;

  /**
   * The webhook id of the webhook to delete.
   *
   * @generated from field: string webhook_id = 1;
   */
  webhookId: string;
};

/**
 * Describes the message utila.api.v1.DeleteWebhookRequest.
 * Use `create(DeleteWebhookRequestSchema)` to create a new message.
 */
export const DeleteWebhookRequestSchema: GenMessage<DeleteWebhookRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 5);

/**
 * The request message for TestEndpoint.
 *
 * @generated from message utila.api.v1.TestEndpointRequest
 */
export type TestEndpointRequest = Message<"utila.api.v1.TestEndpointRequest"> & {
  /**
   * The vault id where this webhook endpoint will be tested.
   *
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;

  /**
   * The webhook endpoint URL.
   *
   * @generated from field: string endpoint_url = 1;
   */
  endpointUrl: string;
};

/**
 * Describes the message utila.api.v1.TestEndpointRequest.
 * Use `create(TestEndpointRequestSchema)` to create a new message.
 */
export const TestEndpointRequestSchema: GenMessage<TestEndpointRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 6);

/**
 * The response message for TestEndpoint.
 *
 * @generated from message utila.api.v1.TestEndpointResponse
 */
export type TestEndpointResponse = Message<"utila.api.v1.TestEndpointResponse"> & {
  /**
   * Whether the send attempt succeeded.
   *
   * @generated from field: bool success = 1;
   */
  success: boolean;

  /**
   * Details about the send attempt.
   *
   * @generated from field: string details = 2;
   */
  details: string;
};

/**
 * Describes the message utila.api.v1.TestEndpointResponse.
 * Use `create(TestEndpointResponseSchema)` to create a new message.
 */
export const TestEndpointResponseSchema: GenMessage<TestEndpointResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 7);

/**
 * The request message for GetWebhookSignaturePublicKey.
 *
 * @generated from message utila.api.v1.GetWebhookSignaturePublicKeyRequest
 */
export type GetWebhookSignaturePublicKeyRequest = Message<"utila.api.v1.GetWebhookSignaturePublicKeyRequest"> & {
};

/**
 * Describes the message utila.api.v1.GetWebhookSignaturePublicKeyRequest.
 * Use `create(GetWebhookSignaturePublicKeyRequestSchema)` to create a new message.
 */
export const GetWebhookSignaturePublicKeyRequestSchema: GenMessage<GetWebhookSignaturePublicKeyRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 8);

/**
 * The response message for GetWebhookSignaturePublicKey.
 *
 * @generated from message utila.api.v1.GetWebhookSignaturePublicKeyResponse
 */
export type GetWebhookSignaturePublicKeyResponse = Message<"utila.api.v1.GetWebhookSignaturePublicKeyResponse"> & {
  /**
   * The public key in PEM format.
   *
   * @generated from field: string public_key = 1;
   */
  publicKey: string;
};

/**
 * Describes the message utila.api.v1.GetWebhookSignaturePublicKeyResponse.
 * Use `create(GetWebhookSignaturePublicKeyResponseSchema)` to create a new message.
 */
export const GetWebhookSignaturePublicKeyResponseSchema: GenMessage<GetWebhookSignaturePublicKeyResponse> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_webhook_provider, 9);

/**
 * A service for managing webhooks.
 *
 * @generated from service utila.api.v1.WebhookProvider
 */
export const WebhookProvider: GenService<{
  /**
   * Creates a webhook.
   *
   * @generated from rpc utila.api.v1.WebhookProvider.CreateWebhook
   */
  createWebhook: {
    methodKind: "unary";
    input: typeof CreateWebhookRequestSchema;
    output: typeof WebhookSchema;
  },
  /**
   * Lists webhooks.
   *
   * @generated from rpc utila.api.v1.WebhookProvider.ListWebhooks
   */
  listWebhooks: {
    methodKind: "unary";
    input: typeof ListWebhooksRequestSchema;
    output: typeof ListWebhooksResponseSchema;
  },
  /**
   * Deletes a webhook.
   *
   * @generated from rpc utila.api.v1.WebhookProvider.DeleteWebhook
   */
  deleteWebhook: {
    methodKind: "unary";
    input: typeof DeleteWebhookRequestSchema;
    output: typeof EmptySchema;
  },
  /**
   * Tests an endpoint.
   *
   * @generated from rpc utila.api.v1.WebhookProvider.TestEndpoint
   */
  testEndpoint: {
    methodKind: "unary";
    input: typeof TestEndpointRequestSchema;
    output: typeof TestEndpointResponseSchema;
  },
  /**
   * @generated from rpc utila.api.v1.WebhookProvider.GetWebhookSignaturePublicKey
   */
  getWebhookSignaturePublicKey: {
    methodKind: "unary";
    input: typeof GetWebhookSignaturePublicKeyRequestSchema;
    output: typeof GetWebhookSignaturePublicKeyResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_utila_api_v1_webhook_provider, 0);
