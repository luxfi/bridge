// @generated by protoc-gen-es v2.2.2 with parameter "target=ts"
// @generated from file utila/api/v1alpha2/keys.proto (package utila.api.v1alpha2, syntax proto3)
/* eslint-disable */

import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv1";
import { file_google_api_field_behavior } from "../../../google/api/field_behavior_pb";
import { file_google_api_resource } from "../../../google/api/resource_pb";
import { file_google_protobuf_descriptor } from "@bufbuild/protobuf/wkt";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../protoc-gen-openapiv2/options/annotations_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file utila/api/v1alpha2/keys.proto.
 */
export const file_utila_api_v1alpha2_keys: GenFile = /*@__PURE__*/
  fileDesc("Ch11dGlsYS9hcGkvdjFhbHBoYTIva2V5cy5wcm90bxISdXRpbGEuYXBpLnYxYWxwaGEyIpwBCgNLZXkSWAoEbmFtZRgBIAEoCUJKkkFDSicidmF1bHRzLzFiMjU2MzVhNWIzZi9rZXlzLzk1MjU3YzVhNTIyZiLKPhf6AhRuYW1lPXZhdWx0cy8qL2tleXMvKuJBAQM6O+pBOAoQYXBpLnV0aWxhLmlvL0tleRIZdmF1bHRzL3t2YXVsdH0va2V5cy97a2V5fSoEa2V5czIDa2V5QipaKHV0aWxhLmlvL2dlbnByb3RvL2FwaS92MWFscGhhMjthcGl2MWEycGJiBnByb3RvMw", [file_google_api_field_behavior, file_google_api_resource, file_google_protobuf_descriptor, file_protoc_gen_openapiv2_options_annotations]);

/**
 * @generated from message utila.api.v1alpha2.Key
 */
export type Key = Message<"utila.api.v1alpha2.Key"> & {
  /**
   * The resource name of the key.
   *
   * Format: `vaults/{vault_id}/keys/{key_id}`
   *
   * @generated from field: string name = 1;
   */
  name: string;
};

/**
 * Describes the message utila.api.v1alpha2.Key.
 * Use `create(KeySchema)` to create a new message.
 */
export const KeySchema: GenMessage<Key> = /*@__PURE__*/
  messageDesc(file_utila_api_v1alpha2_keys, 0);

