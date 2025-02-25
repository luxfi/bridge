// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1alpha1/types.proto (package utila.api.v1alpha1, syntax proto3)
/* eslint-disable */

import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv1";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1alpha1/types.proto.
 */
export const file_utila_api_v1alpha1_types: GenFile = /*@__PURE__*/
  fileDesc("Ch51dGlsYS9hcGkvdjFhbHBoYTEvdHlwZXMucHJvdG8SEnV0aWxhLmFwaS52MWFscGhhMSI3Cg5Db252ZXJ0ZWRWYWx1ZRIOCgZhbW91bnQYASABKAkSFQoNY3VycmVuY3lfY29kZRgCIAEoCUIkWiJ1dGlsYS5pby9nZW5wcm90by9hcGkvdjFhbHBoYTE7YXBpYgZwcm90bzM");

/**
 * A message representing a converted value.
 *
 * @generated from message utila.api.v1alpha1.ConvertedValue
 */
export type ConvertedValue = Message<"utila.api.v1alpha1.ConvertedValue"> & {
  /**
   * The amount in USD.
   *
   * @generated from field: string amount = 1;
   */
  amount: string;

  /**
   * The currency code of the amount. Always USD.
   *
   * @generated from field: string currency_code = 2;
   */
  currencyCode: string;
};

/**
 * Describes the message utila.api.v1alpha1.ConvertedValue.
 * Use `create(ConvertedValueSchema)` to create a new message.
 */
export const ConvertedValueSchema: GenMessage<ConvertedValue> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha1_types, 0);

