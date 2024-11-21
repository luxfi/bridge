// Copyright 2023 Google LLC
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
// @generated from file google/api/field_behavior.proto (package google.api, syntax proto3)
/* eslint-disable */

import { enumDesc, extDesc, fileDesc, tsEnum } from "@bufbuild/protobuf/codegenv1";
import { file_google_protobuf_descriptor } from "@bufbuild/protobuf/wkt";

/**
 * Describes the file google/api/field_behavior.proto.
 */
export const file_google_api_field_behavior = /*@__PURE__*/
  fileDesc("Ch9nb29nbGUvYXBpL2ZpZWxkX2JlaGF2aW9yLnByb3RvEgpnb29nbGUuYXBpKrYBCg1GaWVsZEJlaGF2aW9yEh4KGkZJRUxEX0JFSEFWSU9SX1VOU1BFQ0lGSUVEEAASDAoIT1BUSU9OQUwQARIMCghSRVFVSVJFRBACEg8KC09VVFBVVF9PTkxZEAMSDgoKSU5QVVRfT05MWRAEEg0KCUlNTVVUQUJMRRAFEhIKDlVOT1JERVJFRF9MSVNUEAYSFQoRTk9OX0VNUFRZX0RFRkFVTFQQBxIOCgpJREVOVElGSUVSEAg6YAoOZmllbGRfYmVoYXZpb3ISHS5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zGJwIIAMoDjIZLmdvb2dsZS5hcGkuRmllbGRCZWhhdmlvclINZmllbGRCZWhhdmlvckJwCg5jb20uZ29vZ2xlLmFwaUISRmllbGRCZWhhdmlvclByb3RvUAFaQWdvb2dsZS5nb2xhbmcub3JnL2dlbnByb3RvL2dvb2dsZWFwaXMvYXBpL2Fubm90YXRpb25zO2Fubm90YXRpb25zogIER0FQSWIGcHJvdG8z", [file_google_protobuf_descriptor]);

/**
 * Describes the enum google.api.FieldBehavior.
 */
export const FieldBehaviorSchema = /*@__PURE__*/
  enumDesc(file_google_api_field_behavior, 0);

/**
 * An indicator of the behavior of a given field (for example, that a field
 * is required in requests, or given as output but ignored as input).
 * This **does not** change the behavior in protocol buffers itself; it only
 * denotes the behavior and may affect how API tooling handles the field.
 *
 * Note: This enum **may** receive new values in the future.
 *
 * @generated from enum google.api.FieldBehavior
 */
export const FieldBehavior = /*@__PURE__*/
  tsEnum(FieldBehaviorSchema);

/**
 * A designation of a specific field behavior (required, output only, etc.)
 * in protobuf messages.
 *
 * Examples:
 *
 *   string name = 1 [(google.api.field_behavior) = REQUIRED];
 *   State state = 1 [(google.api.field_behavior) = OUTPUT_ONLY];
 *   google.protobuf.Duration ttl = 1
 *     [(google.api.field_behavior) = INPUT_ONLY];
 *   google.protobuf.Timestamp expire_time = 1
 *     [(google.api.field_behavior) = OUTPUT_ONLY,
 *      (google.api.field_behavior) = IMMUTABLE];
 *
 * @generated from extension: repeated google.api.FieldBehavior field_behavior = 1052;
 */
export const field_behavior = /*@__PURE__*/
  extDesc(file_google_api_field_behavior, 0);

