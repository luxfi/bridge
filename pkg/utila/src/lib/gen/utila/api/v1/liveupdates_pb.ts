// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1/liveupdates.proto (package utila.api.v1, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_google_api_annotations } from "../../../google/api/annotations_pb";
import { file_google_api_field_behavior } from "../../../google/api/field_behavior_pb";
import type { Transaction } from "./api_pb";
import { file_utila_api_v1_api } from "./api_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1/liveupdates.proto.
 */
export const file_utila_api_v1_liveupdates: GenFile = /*@__PURE__*/
  fileDesc("Ch51dGlsYS9hcGkvdjEvbGl2ZXVwZGF0ZXMucHJvdG8SDHV0aWxhLmFwaS52MSKyAQoTU3RyZWFtRXZlbnRzUmVxdWVzdBIXCgl2YXVsdF9pZHMYASADKAlCBOJBAQESQwoOcmVzb3VyY2VfdHlwZXMYAiADKA4yJS51dGlsYS5hcGkudjEuRXZlbnQuUmVzb3VyY2VUeXBlLkVudW1CBOJBAQESPQoLZXZlbnRfdHlwZXMYAyADKA4yIi51dGlsYS5hcGkudjEuRXZlbnQuRXZlbnRUeXBlLkVudW1CBOJBAQEinwQKBUV2ZW50EhAKCGV2ZW50X2lkGAEgASgJEhMKCHZhdWx0X2lkGNTUvWkgASgJEjYKCmV2ZW50X3R5cGUYAyABKA4yIi51dGlsYS5hcGkudjEuRXZlbnQuRXZlbnRUeXBlLkVudW0SMQoHZGV0YWlscxgEIAEoCzIgLnV0aWxhLmFwaS52MS5FdmVudC5FdmVudERldGFpbHMSLgoIcmVzb3VyY2UYBSABKAsyHC51dGlsYS5hcGkudjEuRXZlbnQuUmVzb3VyY2UaWAoMUmVzb3VyY2VUeXBlIkgKBEVudW0SHQoZUkVTT1VSQ0VfVFlQRV9VTlNQRUNJRklFRBAAEg8KC1RSQU5TQUNUSU9OEAESEAoMVkFVTFRfQUNUSU9OEAIaYQoJRXZlbnRUeXBlIlQKBEVudW0SGgoWRVZFTlRfVFlQRV9VTlNQRUNJRklFRBAAEhcKE1RSQU5TQUNUSU9OX0NSRUFURUQQARIXChNUUkFOU0FDVElPTl9VUERBVEVEEAIahgEKCFJlc291cmNlEjwKDXJlc291cmNlX3R5cGUYASABKA4yJS51dGlsYS5hcGkudjEuRXZlbnQuUmVzb3VyY2VUeXBlLkVudW0SMAoLdHJhbnNhY3Rpb24YAiABKAsyGS51dGlsYS5hcGkudjEuVHJhbnNhY3Rpb25IAEIKCghyZXNvdXJjZRoOCgxFdmVudERldGFpbHMygAEKC0xpdmVVcGRhdGVzEnEKDFN0cmVhbUV2ZW50cxIhLnV0aWxhLmFwaS52MS5TdHJlYW1FdmVudHNSZXF1ZXN0GhMudXRpbGEuYXBpLnYxLkV2ZW50IieC0+STAiE6ASoiHC92MS9saXZldXBkYXRlczpzdHJlYW1FdmVudHMwAUIeWhx1dGlsYS5pby9nZW5wcm90by9hcGkvdjE7YXBpYgZwcm90bzM", [file_google_api_annotations, file_google_api_field_behavior, file_utila_api_v1_api]);

/**
 * Request for the StreamEvents method.
 *
 * @generated from message utila.api.v1.StreamEventsRequest
 */
export type StreamEventsRequest = Message<"utila.api.v1.StreamEventsRequest"> & {
  /**
   * A list of vaults to subscribe to.
   * Defaults to all vaults available for the user.
   *
   * @generated from field: repeated string vault_ids = 1;
   */
  vaultIds: string[];

  /**
   * A list of resource types to subscribe to.
   * Defaults to all possible resource types.
   *
   * @generated from field: repeated utila.api.v1.Event.ResourceType.Enum resource_types = 2;
   */
  resourceTypes: Event_ResourceType_Enum[];

  /**
   * A list of event types to subscribe to.
   * Defaults to all possible event types.
   *
   * @generated from field: repeated utila.api.v1.Event.EventType.Enum event_types = 3;
   */
  eventTypes: Event_EventType_Enum[];
};

/**
 * Describes the message utila.api.v1.StreamEventsRequest.
 * Use `create(StreamEventsRequestSchema)` to create a new message.
 */
export const StreamEventsRequestSchema: GenMessage<StreamEventsRequest> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_liveupdates, 0);

/**
 * An event.
 *
 * @generated from message utila.api.v1.Event
 */
export type Event = Message<"utila.api.v1.Event"> & {
  /**
   * The event id.
   *
   * @generated from field: string event_id = 1;
   */
  eventId: string;

  /**
   * The vault id.
   *
   * @generated from field: string vault_id = 221211220;
   */
  vaultId: string;

  /**
   * The event type.
   *
   * @generated from field: utila.api.v1.Event.EventType.Enum event_type = 3;
   */
  eventType: Event_EventType_Enum;

  /**
   * Additional details about the event.
   *
   * @generated from field: utila.api.v1.Event.EventDetails details = 4;
   */
  details?: Event_EventDetails;

  /**
   * The resource relevant for the event.
   *
   * @generated from field: utila.api.v1.Event.Resource resource = 5;
   */
  resource?: Event_Resource;
};

/**
 * Describes the message utila.api.v1.Event.
 * Use `create(EventSchema)` to create a new message.
 */
export const EventSchema: GenMessage<Event> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_liveupdates, 1);

/**
 * The resource types to subscribe to.
 *
 * @generated from message utila.api.v1.Event.ResourceType
 */
export type Event_ResourceType = Message<"utila.api.v1.Event.ResourceType"> & {
};

/**
 * Describes the message utila.api.v1.Event.ResourceType.
 * Use `create(Event_ResourceTypeSchema)` to create a new message.
 */
export const Event_ResourceTypeSchema: GenMessage<Event_ResourceType> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_liveupdates, 1, 0);

/**
 * @generated from enum utila.api.v1.Event.ResourceType.Enum
 */
export enum Event_ResourceType_Enum {
  /**
   * Unspecified resource type.
   *
   * @generated from enum value: RESOURCE_TYPE_UNSPECIFIED = 0;
   */
  RESOURCE_TYPE_UNSPECIFIED = 0,

  /**
   * Transactions type.
   *
   * @generated from enum value: TRANSACTION = 1;
   */
  TRANSACTION = 1,

  /**
   * Vault action type.
   *
   * @generated from enum value: VAULT_ACTION = 2;
   */
  VAULT_ACTION = 2,
}

/**
 * Describes the enum utila.api.v1.Event.ResourceType.Enum.
 */
export const Event_ResourceType_EnumSchema: GenEnum<Event_ResourceType_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1_liveupdates, 1, 0, 0);

/**
 * The event type.
 *
 * @generated from message utila.api.v1.Event.EventType
 */
export type Event_EventType = Message<"utila.api.v1.Event.EventType"> & {
};

/**
 * Describes the message utila.api.v1.Event.EventType.
 * Use `create(Event_EventTypeSchema)` to create a new message.
 */
export const Event_EventTypeSchema: GenMessage<Event_EventType> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_liveupdates, 1, 1);

/**
 * @generated from enum utila.api.v1.Event.EventType.Enum
 */
export enum Event_EventType_Enum {
  /**
   * Unspecified event type.
   *
   * @generated from enum value: EVENT_TYPE_UNSPECIFIED = 0;
   */
  EVENT_TYPE_UNSPECIFIED = 0,

  /**
   * A new transaction was created.
   *
   * @generated from enum value: TRANSACTION_CREATED = 1;
   */
  TRANSACTION_CREATED = 1,

  /**
   * A transaction was updated.
   *
   * @generated from enum value: TRANSACTION_UPDATED = 2;
   */
  TRANSACTION_UPDATED = 2,
}

/**
 * Describes the enum utila.api.v1.Event.EventType.Enum.
 */
export const Event_EventType_EnumSchema: GenEnum<Event_EventType_Enum> = /*@__PURE__*/
  enumDesc(file_utila_api_v1_liveupdates, 1, 1, 0);

/**
 * @generated from message utila.api.v1.Event.Resource
 */
export type Event_Resource = Message<"utila.api.v1.Event.Resource"> & {
  /**
   * @generated from field: utila.api.v1.Event.ResourceType.Enum resource_type = 1;
   */
  resourceType: Event_ResourceType_Enum;

  /**
   * @generated from oneof utila.api.v1.Event.Resource.resource
   */
  resource: {
    /**
     * The transaction resource.
     *
     * @generated from field: utila.api.v1.Transaction transaction = 2;
     */
    value: Transaction;
    case: "transaction";
  } | { case: undefined; value?: undefined };
};

/**
 * Describes the message utila.api.v1.Event.Resource.
 * Use `create(Event_ResourceSchema)` to create a new message.
 */
export const Event_ResourceSchema: GenMessage<Event_Resource> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_liveupdates, 1, 2);

/**
 * @generated from message utila.api.v1.Event.EventDetails
 */
export type Event_EventDetails = Message<"utila.api.v1.Event.EventDetails"> & {
};

/**
 * Describes the message utila.api.v1.Event.EventDetails.
 * Use `create(Event_EventDetailsSchema)` to create a new message.
 */
export const Event_EventDetailsSchema: GenMessage<Event_EventDetails> = /*@__PURE__*/
  messageDesc(file_utila_api_v1_liveupdates, 1, 3);

/**
 * The live updates service provides a way to subscribe to live updates for a
 *
 * @generated from service utila.api.v1.LiveUpdates
 */
export const LiveUpdates: GenService<{
  /**
   * Subscribe to live updates.
   *
   * @generated from rpc utila.api.v1.LiveUpdates.StreamEvents
   */
  streamEvents: {
    methodKind: "server_streaming";
    input: typeof StreamEventsRequestSchema;
    output: typeof EventSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_utila_api_v1_liveupdates, 0);

