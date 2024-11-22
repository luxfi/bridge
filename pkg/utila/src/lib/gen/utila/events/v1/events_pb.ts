// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/events/v1/events.proto (package utila.events.v1, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv1";
import type { Transaction, VaultAction } from "../../api/v1/api_pb";
import { file_utila_api_v1_api } from "../../api/v1/api_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/events/v1/events.proto.
 */
export const file_utila_events_v1_events: GenFile = /*@__PURE__*/
  fileDesc("Chx1dGlsYS9ldmVudHMvdjEvZXZlbnRzLnByb3RvEg91dGlsYS5ldmVudHMudjEinwEKBUV2ZW50ElAKGHRyYW5zYWN0aW9uX3N0YXRlX2NoYW5nZRgBIAEoCzIsLnV0aWxhLmV2ZW50cy52MS5UcmFuc2FjdGlvblN0YXRlQ2hhbmdlRXZlbnRIABI5Cgx2YXVsdF9hY3Rpb24YAiABKAsyIS51dGlsYS5ldmVudHMudjEuVmF1bHRBY3Rpb25FdmVudEgAQgkKB3BheWxvYWQiTQobVHJhbnNhY3Rpb25TdGF0ZUNoYW5nZUV2ZW50Ei4KC3RyYW5zYWN0aW9uGAEgASgLMhkudXRpbGEuYXBpLnYxLlRyYW5zYWN0aW9uIlUKEFZhdWx0QWN0aW9uRXZlbnQSLwoMdmF1bHRfYWN0aW9uGAEgASgLMhkudXRpbGEuYXBpLnYxLlZhdWx0QWN0aW9uEhAKCHZhdWx0X2lkGAIgASgJIrgCChJQZW5kaW5nQWN0aW9uRXZlbnQSEAoIdmF1bHRfaWQYASABKAkSEQoJZW50aXR5X2lkGAIgASgJEjYKBHR5cGUYAyABKA4yKC51dGlsYS5ldmVudHMudjEuUGVuZGluZ0FjdGlvbkV2ZW50LkVudW0SDQoFdGl0bGUYBCABKAkSEAoIc3VidGl0bGUYBSABKAkiowEKBEVudW0SDwoLVU5TUEVDSUZJRUQQABIUChBUUkFOU0FDVElPTl9WT1RFEAESFAoQVFJBTlNBQ1RJT05fU0lHThACEhUKEVZBVUxUX0FDVElPTl9WT1RFEAMSFQoRVkFVTFRfQUNUSU9OX1NJR04QBBIWChJNRkFfTE9HSU5fQ09NUExFVEUQBRIYChNDQU5DRUxfTk9USUZJQ0FUSU9OEJBOQiRaInV0aWxhLmlvL2dlbnByb3RvL2V2ZW50cy92MTtldmVudHNiBnByb3RvMw", [file_utila_api_v1_api]);

/**
 * @generated from message utila.events.v1.Event
 */
export type Event = Message<"utila.events.v1.Event"> & {
  /**
   * @generated from oneof utila.events.v1.Event.payload
   */
  payload: {
    /**
     * @generated from field: utila.events.v1.TransactionStateChangeEvent transaction_state_change = 1;
     */
    value: TransactionStateChangeEvent;
    case: "transactionStateChange";
  } | {
    /**
     * @generated from field: utila.events.v1.VaultActionEvent vault_action = 2;
     */
    value: VaultActionEvent;
    case: "vaultAction";
  } | { case: undefined; value?: undefined };
};

/**
 * Describes the message utila.events.v1.Event.
 * Use `create(EventSchema)` to create a new message.
 */
export const EventSchema: GenMessage<Event> = /*@__PURE__*/
  messageDesc(file_utila_events_v1_events, 0);

/**
 * @generated from message utila.events.v1.TransactionStateChangeEvent
 */
export type TransactionStateChangeEvent = Message<"utila.events.v1.TransactionStateChangeEvent"> & {
  /**
   * @generated from field: utila.api.v1.Transaction transaction = 1;
   */
  transaction?: Transaction;
};

/**
 * Describes the message utila.events.v1.TransactionStateChangeEvent.
 * Use `create(TransactionStateChangeEventSchema)` to create a new message.
 */
export const TransactionStateChangeEventSchema: GenMessage<TransactionStateChangeEvent> = /*@__PURE__*/
  messageDesc(file_utila_events_v1_events, 1);

/**
 * @generated from message utila.events.v1.VaultActionEvent
 */
export type VaultActionEvent = Message<"utila.events.v1.VaultActionEvent"> & {
  /**
   * @generated from field: utila.api.v1.VaultAction vault_action = 1;
   */
  vaultAction?: VaultAction;

  /**
   * @generated from field: string vault_id = 2;
   */
  vaultId: string;
};

/**
 * Describes the message utila.events.v1.VaultActionEvent.
 * Use `create(VaultActionEventSchema)` to create a new message.
 */
export const VaultActionEventSchema: GenMessage<VaultActionEvent> = /*@__PURE__*/
  messageDesc(file_utila_events_v1_events, 2);

/**
 * @generated from message utila.events.v1.PendingActionEvent
 */
export type PendingActionEvent = Message<"utila.events.v1.PendingActionEvent"> & {
  /**
   * @generated from field: string vault_id = 1;
   */
  vaultId: string;

  /**
   * @generated from field: string entity_id = 2;
   */
  entityId: string;

  /**
   * @generated from field: utila.events.v1.PendingActionEvent.Enum type = 3;
   */
  type: PendingActionEvent_Enum;

  /**
   * @generated from field: string title = 4;
   */
  title: string;

  /**
   * @generated from field: string subtitle = 5;
   */
  subtitle: string;
};

/**
 * Describes the message utila.events.v1.PendingActionEvent.
 * Use `create(PendingActionEventSchema)` to create a new message.
 */
export const PendingActionEventSchema: GenMessage<PendingActionEvent> = /*@__PURE__*/
  messageDesc(file_utila_events_v1_events, 3);

/**
 * @generated from enum utila.events.v1.PendingActionEvent.Enum
 */
export enum PendingActionEvent_Enum {
  /**
   * @generated from enum value: UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: TRANSACTION_VOTE = 1;
   */
  TRANSACTION_VOTE = 1,

  /**
   * @generated from enum value: TRANSACTION_SIGN = 2;
   */
  TRANSACTION_SIGN = 2,

  /**
   * @generated from enum value: VAULT_ACTION_VOTE = 3;
   */
  VAULT_ACTION_VOTE = 3,

  /**
   * @generated from enum value: VAULT_ACTION_SIGN = 4;
   */
  VAULT_ACTION_SIGN = 4,

  /**
   * @generated from enum value: MFA_LOGIN_COMPLETE = 5;
   */
  MFA_LOGIN_COMPLETE = 5,

  /**
   * @generated from enum value: CANCEL_NOTIFICATION = 10000;
   */
  CANCEL_NOTIFICATION = 10000,
}

/**
 * Describes the enum utila.events.v1.PendingActionEvent.Enum.
 */
export const PendingActionEvent_EnumSchema: GenEnum<PendingActionEvent_Enum> = /*@__PURE__*/
  enumDesc(file_utila_events_v1_events, 3, 0);
