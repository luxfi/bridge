// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @generated by protoc-gen-es v2.2.2
// @generated from file google/rpc/error_details.proto (package google.rpc, syntax proto3)
/* eslint-disable */

import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Message } from "@bufbuild/protobuf";
import type { Duration } from "@bufbuild/protobuf/wkt";

/**
 * Describes the file google/rpc/error_details.proto.
 */
export declare const file_google_rpc_error_details: GenFile;

/**
 * Describes the cause of the error with structured details.
 *
 * Example of an error when contacting the "pubsub.googleapis.com" API when it
 * is not enabled:
 *
 *     { "reason": "API_DISABLED"
 *       "domain": "googleapis.com"
 *       "metadata": {
 *         "resource": "projects/123",
 *         "service": "pubsub.googleapis.com"
 *       }
 *     }
 *
 * This response indicates that the pubsub.googleapis.com API is not enabled.
 *
 * Example of an error that is returned when attempting to create a Spanner
 * instance in a region that is out of stock:
 *
 *     { "reason": "STOCKOUT"
 *       "domain": "spanner.googleapis.com",
 *       "metadata": {
 *         "availableRegions": "us-central1,us-east2"
 *       }
 *     }
 *
 * @generated from message google.rpc.ErrorInfo
 */
export declare type ErrorInfo = Message<"google.rpc.ErrorInfo"> & {
  /**
   * The reason of the error. This is a constant value that identifies the
   * proximate cause of the error. Error reasons are unique within a particular
   * domain of errors. This should be at most 63 characters and match a
   * regular expression of `[A-Z][A-Z0-9_]+[A-Z0-9]`, which represents
   * UPPER_SNAKE_CASE.
   *
   * @generated from field: string reason = 1;
   */
  reason: string;

  /**
   * The logical grouping to which the "reason" belongs. The error domain
   * is typically the registered service name of the tool or product that
   * generates the error. Example: "pubsub.googleapis.com". If the error is
   * generated by some common infrastructure, the error domain must be a
   * globally unique value that identifies the infrastructure. For Google API
   * infrastructure, the error domain is "googleapis.com".
   *
   * @generated from field: string domain = 2;
   */
  domain: string;

  /**
   * Additional structured details about this error.
   *
   * Keys should match /[a-zA-Z0-9-_]/ and be limited to 64 characters in
   * length. When identifying the current value of an exceeded limit, the units
   * should be contained in the key, not the value.  For example, rather than
   * {"instanceLimit": "100/request"}, should be returned as,
   * {"instanceLimitPerRequest": "100"}, if the client exceeds the number of
   * instances that can be created in a single (batch) request.
   *
   * @generated from field: map<string, string> metadata = 3;
   */
  metadata: { [key: string]: string };
};

/**
 * Describes the message google.rpc.ErrorInfo.
 * Use `create(ErrorInfoSchema)` to create a new message.
 */
export declare const ErrorInfoSchema: GenMessage<ErrorInfo>;

/**
 * Describes when the clients can retry a failed request. Clients could ignore
 * the recommendation here or retry when this information is missing from error
 * responses.
 *
 * It's always recommended that clients should use exponential backoff when
 * retrying.
 *
 * Clients should wait until `retry_delay` amount of time has passed since
 * receiving the error response before retrying.  If retrying requests also
 * fail, clients should use an exponential backoff scheme to gradually increase
 * the delay between retries based on `retry_delay`, until either a maximum
 * number of retries have been reached or a maximum retry delay cap has been
 * reached.
 *
 * @generated from message google.rpc.RetryInfo
 */
export declare type RetryInfo = Message<"google.rpc.RetryInfo"> & {
  /**
   * Clients should wait at least this long between retrying the same request.
   *
   * @generated from field: google.protobuf.Duration retry_delay = 1;
   */
  retryDelay?: Duration;
};

/**
 * Describes the message google.rpc.RetryInfo.
 * Use `create(RetryInfoSchema)` to create a new message.
 */
export declare const RetryInfoSchema: GenMessage<RetryInfo>;

/**
 * Describes additional debugging info.
 *
 * @generated from message google.rpc.DebugInfo
 */
export declare type DebugInfo = Message<"google.rpc.DebugInfo"> & {
  /**
   * The stack trace entries indicating where the error occurred.
   *
   * @generated from field: repeated string stack_entries = 1;
   */
  stackEntries: string[];

  /**
   * Additional debugging information provided by the server.
   *
   * @generated from field: string detail = 2;
   */
  detail: string;
};

/**
 * Describes the message google.rpc.DebugInfo.
 * Use `create(DebugInfoSchema)` to create a new message.
 */
export declare const DebugInfoSchema: GenMessage<DebugInfo>;

/**
 * Describes how a quota check failed.
 *
 * For example if a daily limit was exceeded for the calling project,
 * a service could respond with a QuotaFailure detail containing the project
 * id and the description of the quota limit that was exceeded.  If the
 * calling project hasn't enabled the service in the developer console, then
 * a service could respond with the project id and set `service_disabled`
 * to true.
 *
 * Also see RetryInfo and Help types for other details about handling a
 * quota failure.
 *
 * @generated from message google.rpc.QuotaFailure
 */
export declare type QuotaFailure = Message<"google.rpc.QuotaFailure"> & {
  /**
   * Describes all quota violations.
   *
   * @generated from field: repeated google.rpc.QuotaFailure.Violation violations = 1;
   */
  violations: QuotaFailure_Violation[];
};

/**
 * Describes the message google.rpc.QuotaFailure.
 * Use `create(QuotaFailureSchema)` to create a new message.
 */
export declare const QuotaFailureSchema: GenMessage<QuotaFailure>;

/**
 * A message type used to describe a single quota violation.  For example, a
 * daily quota or a custom quota that was exceeded.
 *
 * @generated from message google.rpc.QuotaFailure.Violation
 */
export declare type QuotaFailure_Violation = Message<"google.rpc.QuotaFailure.Violation"> & {
  /**
   * The subject on which the quota check failed.
   * For example, "clientip:<ip address of client>" or "project:<Google
   * developer project id>".
   *
   * @generated from field: string subject = 1;
   */
  subject: string;

  /**
   * A description of how the quota check failed. Clients can use this
   * description to find more about the quota configuration in the service's
   * public documentation, or find the relevant quota limit to adjust through
   * developer console.
   *
   * For example: "Service disabled" or "Daily Limit for read operations
   * exceeded".
   *
   * @generated from field: string description = 2;
   */
  description: string;
};

/**
 * Describes the message google.rpc.QuotaFailure.Violation.
 * Use `create(QuotaFailure_ViolationSchema)` to create a new message.
 */
export declare const QuotaFailure_ViolationSchema: GenMessage<QuotaFailure_Violation>;

/**
 * Describes what preconditions have failed.
 *
 * For example, if an RPC failed because it required the Terms of Service to be
 * acknowledged, it could list the terms of service violation in the
 * PreconditionFailure message.
 *
 * @generated from message google.rpc.PreconditionFailure
 */
export declare type PreconditionFailure = Message<"google.rpc.PreconditionFailure"> & {
  /**
   * Describes all precondition violations.
   *
   * @generated from field: repeated google.rpc.PreconditionFailure.Violation violations = 1;
   */
  violations: PreconditionFailure_Violation[];
};

/**
 * Describes the message google.rpc.PreconditionFailure.
 * Use `create(PreconditionFailureSchema)` to create a new message.
 */
export declare const PreconditionFailureSchema: GenMessage<PreconditionFailure>;

/**
 * A message type used to describe a single precondition failure.
 *
 * @generated from message google.rpc.PreconditionFailure.Violation
 */
export declare type PreconditionFailure_Violation = Message<"google.rpc.PreconditionFailure.Violation"> & {
  /**
   * The type of PreconditionFailure. We recommend using a service-specific
   * enum type to define the supported precondition violation subjects. For
   * example, "TOS" for "Terms of Service violation".
   *
   * @generated from field: string type = 1;
   */
  type: string;

  /**
   * The subject, relative to the type, that failed.
   * For example, "google.com/cloud" relative to the "TOS" type would indicate
   * which terms of service is being referenced.
   *
   * @generated from field: string subject = 2;
   */
  subject: string;

  /**
   * A description of how the precondition failed. Developers can use this
   * description to understand how to fix the failure.
   *
   * For example: "Terms of service not accepted".
   *
   * @generated from field: string description = 3;
   */
  description: string;
};

/**
 * Describes the message google.rpc.PreconditionFailure.Violation.
 * Use `create(PreconditionFailure_ViolationSchema)` to create a new message.
 */
export declare const PreconditionFailure_ViolationSchema: GenMessage<PreconditionFailure_Violation>;

/**
 * Describes violations in a client request. This error type focuses on the
 * syntactic aspects of the request.
 *
 * @generated from message google.rpc.BadRequest
 */
export declare type BadRequest = Message<"google.rpc.BadRequest"> & {
  /**
   * Describes all violations in a client request.
   *
   * @generated from field: repeated google.rpc.BadRequest.FieldViolation field_violations = 1;
   */
  fieldViolations: BadRequest_FieldViolation[];
};

/**
 * Describes the message google.rpc.BadRequest.
 * Use `create(BadRequestSchema)` to create a new message.
 */
export declare const BadRequestSchema: GenMessage<BadRequest>;

/**
 * A message type used to describe a single bad request field.
 *
 * @generated from message google.rpc.BadRequest.FieldViolation
 */
export declare type BadRequest_FieldViolation = Message<"google.rpc.BadRequest.FieldViolation"> & {
  /**
   * A path that leads to a field in the request body. The value will be a
   * sequence of dot-separated identifiers that identify a protocol buffer
   * field.
   *
   * Consider the following:
   *
   *     message CreateContactRequest {
   *       message EmailAddress {
   *         enum Type {
   *           TYPE_UNSPECIFIED = 0;
   *           HOME = 1;
   *           WORK = 2;
   *         }
   *
   *         optional string email = 1;
   *         repeated EmailType type = 2;
   *       }
   *
   *       string full_name = 1;
   *       repeated EmailAddress email_addresses = 2;
   *     }
   *
   * In this example, in proto `field` could take one of the following values:
   *
   * * `full_name` for a violation in the `full_name` value
   * * `email_addresses[1].email` for a violation in the `email` field of the
   *   first `email_addresses` message
   * * `email_addresses[3].type[2]` for a violation in the second `type`
   *   value in the third `email_addresses` message.
   *
   * In JSON, the same values are represented as:
   *
   * * `fullName` for a violation in the `fullName` value
   * * `emailAddresses[1].email` for a violation in the `email` field of the
   *   first `emailAddresses` message
   * * `emailAddresses[3].type[2]` for a violation in the second `type`
   *   value in the third `emailAddresses` message.
   *
   * @generated from field: string field = 1;
   */
  field: string;

  /**
   * A description of why the request element is bad.
   *
   * @generated from field: string description = 2;
   */
  description: string;
};

/**
 * Describes the message google.rpc.BadRequest.FieldViolation.
 * Use `create(BadRequest_FieldViolationSchema)` to create a new message.
 */
export declare const BadRequest_FieldViolationSchema: GenMessage<BadRequest_FieldViolation>;

/**
 * Contains metadata about the request that clients can attach when filing a bug
 * or providing other forms of feedback.
 *
 * @generated from message google.rpc.RequestInfo
 */
export declare type RequestInfo = Message<"google.rpc.RequestInfo"> & {
  /**
   * An opaque string that should only be interpreted by the service generating
   * it. For example, it can be used to identify requests in the service's logs.
   *
   * @generated from field: string request_id = 1;
   */
  requestId: string;

  /**
   * Any data that was used to serve this request. For example, an encrypted
   * stack trace that can be sent back to the service provider for debugging.
   *
   * @generated from field: string serving_data = 2;
   */
  servingData: string;
};

/**
 * Describes the message google.rpc.RequestInfo.
 * Use `create(RequestInfoSchema)` to create a new message.
 */
export declare const RequestInfoSchema: GenMessage<RequestInfo>;

/**
 * Describes the resource that is being accessed.
 *
 * @generated from message google.rpc.ResourceInfo
 */
export declare type ResourceInfo = Message<"google.rpc.ResourceInfo"> & {
  /**
   * A name for the type of resource being accessed, e.g. "sql table",
   * "cloud storage bucket", "file", "Google calendar"; or the type URL
   * of the resource: e.g. "type.googleapis.com/google.pubsub.v1.Topic".
   *
   * @generated from field: string resource_type = 1;
   */
  resourceType: string;

  /**
   * The name of the resource being accessed.  For example, a shared calendar
   * name: "example.com_4fghdhgsrgh@group.calendar.google.com", if the current
   * error is
   * [google.rpc.Code.PERMISSION_DENIED][google.rpc.Code.PERMISSION_DENIED].
   *
   * @generated from field: string resource_name = 2;
   */
  resourceName: string;

  /**
   * The owner of the resource (optional).
   * For example, "user:<owner email>" or "project:<Google developer project
   * id>".
   *
   * @generated from field: string owner = 3;
   */
  owner: string;

  /**
   * Describes what error is encountered when accessing this resource.
   * For example, updating a cloud project may require the `writer` permission
   * on the developer console project.
   *
   * @generated from field: string description = 4;
   */
  description: string;
};

/**
 * Describes the message google.rpc.ResourceInfo.
 * Use `create(ResourceInfoSchema)` to create a new message.
 */
export declare const ResourceInfoSchema: GenMessage<ResourceInfo>;

/**
 * Provides links to documentation or for performing an out of band action.
 *
 * For example, if a quota check failed with an error indicating the calling
 * project hasn't enabled the accessed service, this can contain a URL pointing
 * directly to the right place in the developer console to flip the bit.
 *
 * @generated from message google.rpc.Help
 */
export declare type Help = Message<"google.rpc.Help"> & {
  /**
   * URL(s) pointing to additional information on handling the current error.
   *
   * @generated from field: repeated google.rpc.Help.Link links = 1;
   */
  links: Help_Link[];
};

/**
 * Describes the message google.rpc.Help.
 * Use `create(HelpSchema)` to create a new message.
 */
export declare const HelpSchema: GenMessage<Help>;

/**
 * Describes a URL link.
 *
 * @generated from message google.rpc.Help.Link
 */
export declare type Help_Link = Message<"google.rpc.Help.Link"> & {
  /**
   * Describes what the link offers.
   *
   * @generated from field: string description = 1;
   */
  description: string;

  /**
   * The URL of the link.
   *
   * @generated from field: string url = 2;
   */
  url: string;
};

/**
 * Describes the message google.rpc.Help.Link.
 * Use `create(Help_LinkSchema)` to create a new message.
 */
export declare const Help_LinkSchema: GenMessage<Help_Link>;

/**
 * Provides a localized error message that is safe to return to the user
 * which can be attached to an RPC error.
 *
 * @generated from message google.rpc.LocalizedMessage
 */
export declare type LocalizedMessage = Message<"google.rpc.LocalizedMessage"> & {
  /**
   * The locale used following the specification defined at
   * https://www.rfc-editor.org/rfc/bcp/bcp47.txt.
   * Examples are: "en-US", "fr-CH", "es-MX"
   *
   * @generated from field: string locale = 1;
   */
  locale: string;

  /**
   * The localized error message in the above locale.
   *
   * @generated from field: string message = 2;
   */
  message: string;
};

/**
 * Describes the message google.rpc.LocalizedMessage.
 * Use `create(LocalizedMessageSchema)` to create a new message.
 */
export declare const LocalizedMessageSchema: GenMessage<LocalizedMessage>;
