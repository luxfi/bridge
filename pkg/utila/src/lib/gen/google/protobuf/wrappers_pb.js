// Protocol Buffers - Google's data interchange format
// Copyright 2008 Google Inc.  All rights reserved.
// https://developers.google.com/protocol-buffers/
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
//     * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Wrappers for primitive (non-message) types. These types are useful
// for embedding primitives in the `google.protobuf.Any` type and for places
// where we need to distinguish between the absence of a primitive
// typed field and its default value.
//
// These wrappers have no meaningful use within repeated fields as they lack
// the ability to detect presence on individual elements.
// These wrappers have no meaningful use within a map or a oneof since
// individual entries of a map or fields of a oneof can already detect presence.

// @generated by protoc-gen-es v2.2.2
// @generated from file google/protobuf/wrappers.proto (package google.protobuf, syntax proto3)
/* eslint-disable */

import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv1";

/**
 * Describes the file google/protobuf/wrappers.proto.
 */
export const file_google_protobuf_wrappers = /*@__PURE__*/
  fileDesc("Ch5nb29nbGUvcHJvdG9idWYvd3JhcHBlcnMucHJvdG8SD2dvb2dsZS5wcm90b2J1ZiIcCgtEb3VibGVWYWx1ZRINCgV2YWx1ZRgBIAEoASIbCgpGbG9hdFZhbHVlEg0KBXZhbHVlGAEgASgCIhsKCkludDY0VmFsdWUSDQoFdmFsdWUYASABKAMiHAoLVUludDY0VmFsdWUSDQoFdmFsdWUYASABKAQiGwoKSW50MzJWYWx1ZRINCgV2YWx1ZRgBIAEoBSIcCgtVSW50MzJWYWx1ZRINCgV2YWx1ZRgBIAEoDSIaCglCb29sVmFsdWUSDQoFdmFsdWUYASABKAgiHAoLU3RyaW5nVmFsdWUSDQoFdmFsdWUYASABKAkiGwoKQnl0ZXNWYWx1ZRINCgV2YWx1ZRgBIAEoDEKDAQoTY29tLmdvb2dsZS5wcm90b2J1ZkINV3JhcHBlcnNQcm90b1ABWjFnb29nbGUuZ29sYW5nLm9yZy9wcm90b2J1Zi90eXBlcy9rbm93bi93cmFwcGVyc3Bi+AEBogIDR1BCqgIeR29vZ2xlLlByb3RvYnVmLldlbGxLbm93blR5cGVzYgZwcm90bzM");

/**
 * Describes the message google.protobuf.DoubleValue.
 * Use `create(DoubleValueSchema)` to create a new message.
 */
export const DoubleValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 0);

/**
 * Describes the message google.protobuf.FloatValue.
 * Use `create(FloatValueSchema)` to create a new message.
 */
export const FloatValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 1);

/**
 * Describes the message google.protobuf.Int64Value.
 * Use `create(Int64ValueSchema)` to create a new message.
 */
export const Int64ValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 2);

/**
 * Describes the message google.protobuf.UInt64Value.
 * Use `create(UInt64ValueSchema)` to create a new message.
 */
export const UInt64ValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 3);

/**
 * Describes the message google.protobuf.Int32Value.
 * Use `create(Int32ValueSchema)` to create a new message.
 */
export const Int32ValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 4);

/**
 * Describes the message google.protobuf.UInt32Value.
 * Use `create(UInt32ValueSchema)` to create a new message.
 */
export const UInt32ValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 5);

/**
 * Describes the message google.protobuf.BoolValue.
 * Use `create(BoolValueSchema)` to create a new message.
 */
export const BoolValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 6);

/**
 * Describes the message google.protobuf.StringValue.
 * Use `create(StringValueSchema)` to create a new message.
 */
export const StringValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 7);

/**
 * Describes the message google.protobuf.BytesValue.
 * Use `create(BytesValueSchema)` to create a new message.
 */
export const BytesValueSchema = /*@__PURE__*/
  messageDesc(file_google_protobuf_wrappers, 8);
