// @generated by protoc-gen-es v2.2.2
// @generated from file protoc-gen-openapiv2/options/openapiv2.proto (package grpc.gateway.protoc_gen_openapiv2.options, syntax proto3)
/* eslint-disable */

import { enumDesc, fileDesc, messageDesc, tsEnum } from "@bufbuild/protobuf/codegenv1";
import { file_google_protobuf_struct } from "@bufbuild/protobuf/wkt";

/**
 * Describes the file protoc-gen-openapiv2/options/openapiv2.proto.
 */
export const file_protoc_gen_openapiv2_options_openapiv2 = /*@__PURE__*/
  fileDesc("Cixwcm90b2MtZ2VuLW9wZW5hcGl2Mi9vcHRpb25zL29wZW5hcGl2Mi5wcm90bxIpZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMilQcKB1N3YWdnZXISDwoHc3dhZ2dlchgBIAEoCRI9CgRpbmZvGAIgASgLMi8uZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuSW5mbxIMCgRob3N0GAMgASgJEhEKCWJhc2VfcGF0aBgEIAEoCRJCCgdzY2hlbWVzGAUgAygOMjEuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2NoZW1lEhAKCGNvbnN1bWVzGAYgAygJEhAKCHByb2R1Y2VzGAcgAygJElQKCXJlc3BvbnNlcxgKIAMoCzJBLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlN3YWdnZXIuUmVzcG9uc2VzRW50cnkSXAoUc2VjdXJpdHlfZGVmaW5pdGlvbnMYCyABKAsyPi5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5TZWN1cml0eURlZmluaXRpb25zElAKCHNlY3VyaXR5GAwgAygLMj4uZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2VjdXJpdHlSZXF1aXJlbWVudBI8CgR0YWdzGA0gAygLMi4uZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuVGFnElcKDWV4dGVybmFsX2RvY3MYDiABKAsyQC5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5FeHRlcm5hbERvY3VtZW50YXRpb24SVgoKZXh0ZW5zaW9ucxgPIAMoCzJCLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlN3YWdnZXIuRXh0ZW5zaW9uc0VudHJ5GmUKDlJlc3BvbnNlc0VudHJ5EgsKA2tleRgBIAEoCRJCCgV2YWx1ZRgCIAEoCzIzLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlJlc3BvbnNlOgI4ARpJCg9FeHRlbnNpb25zRW50cnkSCwoDa2V5GAEgASgJEiUKBXZhbHVlGAIgASgLMhYuZ29vZ2xlLnByb3RvYnVmLlZhbHVlOgI4AUoECAgQCUoECAkQCiKxBgoJT3BlcmF0aW9uEgwKBHRhZ3MYASADKAkSDwoHc3VtbWFyeRgCIAEoCRITCgtkZXNjcmlwdGlvbhgDIAEoCRJXCg1leHRlcm5hbF9kb2NzGAQgASgLMkAuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuRXh0ZXJuYWxEb2N1bWVudGF0aW9uEhQKDG9wZXJhdGlvbl9pZBgFIAEoCRIQCghjb25zdW1lcxgGIAMoCRIQCghwcm9kdWNlcxgHIAMoCRJWCglyZXNwb25zZXMYCSADKAsyQy5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5PcGVyYXRpb24uUmVzcG9uc2VzRW50cnkSQgoHc2NoZW1lcxgKIAMoDjIxLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlNjaGVtZRISCgpkZXByZWNhdGVkGAsgASgIElAKCHNlY3VyaXR5GAwgAygLMj4uZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2VjdXJpdHlSZXF1aXJlbWVudBJYCgpleHRlbnNpb25zGA0gAygLMkQuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuT3BlcmF0aW9uLkV4dGVuc2lvbnNFbnRyeRJJCgpwYXJhbWV0ZXJzGA4gASgLMjUuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuUGFyYW1ldGVycxplCg5SZXNwb25zZXNFbnRyeRILCgNrZXkYASABKAkSQgoFdmFsdWUYAiABKAsyMy5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5SZXNwb25zZToCOAEaSQoPRXh0ZW5zaW9uc0VudHJ5EgsKA2tleRgBIAEoCRIlCgV2YWx1ZRgCIAEoCzIWLmdvb2dsZS5wcm90b2J1Zi5WYWx1ZToCOAFKBAgIEAkiWQoKUGFyYW1ldGVycxJLCgdoZWFkZXJzGAEgAygLMjouZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuSGVhZGVyUGFyYW1ldGVyIvgBCg9IZWFkZXJQYXJhbWV0ZXISDAoEbmFtZRgBIAEoCRITCgtkZXNjcmlwdGlvbhgCIAEoCRJNCgR0eXBlGAMgASgOMj8uZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuSGVhZGVyUGFyYW1ldGVyLlR5cGUSDgoGZm9ybWF0GAQgASgJEhAKCHJlcXVpcmVkGAUgASgIIkUKBFR5cGUSCwoHVU5LTk9XThAAEgoKBlNUUklORxABEgoKBk5VTUJFUhACEgsKB0lOVEVHRVIQAxILCgdCT09MRUFOEARKBAgGEAdKBAgHEAgiqwEKBkhlYWRlchITCgtkZXNjcmlwdGlvbhgBIAEoCRIMCgR0eXBlGAIgASgJEg4KBmZvcm1hdBgDIAEoCRIPCgdkZWZhdWx0GAYgASgJEg8KB3BhdHRlcm4YDSABKAlKBAgEEAVKBAgFEAZKBAgHEAhKBAgIEAlKBAgJEApKBAgKEAtKBAgLEAxKBAgMEA1KBAgOEA9KBAgPEBBKBAgQEBFKBAgREBJKBAgSEBMiwgQKCFJlc3BvbnNlEhMKC2Rlc2NyaXB0aW9uGAEgASgJEkEKBnNjaGVtYRgCIAEoCzIxLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlNjaGVtYRJRCgdoZWFkZXJzGAMgAygLMkAuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuUmVzcG9uc2UuSGVhZGVyc0VudHJ5ElMKCGV4YW1wbGVzGAQgAygLMkEuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuUmVzcG9uc2UuRXhhbXBsZXNFbnRyeRJXCgpleHRlbnNpb25zGAUgAygLMkMuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuUmVzcG9uc2UuRXh0ZW5zaW9uc0VudHJ5GmEKDEhlYWRlcnNFbnRyeRILCgNrZXkYASABKAkSQAoFdmFsdWUYAiABKAsyMS5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5IZWFkZXI6AjgBGi8KDUV4YW1wbGVzRW50cnkSCwoDa2V5GAEgASgJEg0KBXZhbHVlGAIgASgJOgI4ARpJCg9FeHRlbnNpb25zRW50cnkSCwoDa2V5GAEgASgJEiUKBXZhbHVlGAIgASgLMhYuZ29vZ2xlLnByb3RvYnVmLlZhbHVlOgI4ASL/AgoESW5mbxINCgV0aXRsZRgBIAEoCRITCgtkZXNjcmlwdGlvbhgCIAEoCRIYChB0ZXJtc19vZl9zZXJ2aWNlGAMgASgJEkMKB2NvbnRhY3QYBCABKAsyMi5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5Db250YWN0EkMKB2xpY2Vuc2UYBSABKAsyMi5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5MaWNlbnNlEg8KB3ZlcnNpb24YBiABKAkSUwoKZXh0ZW5zaW9ucxgHIAMoCzI/LmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLkluZm8uRXh0ZW5zaW9uc0VudHJ5GkkKD0V4dGVuc2lvbnNFbnRyeRILCgNrZXkYASABKAkSJQoFdmFsdWUYAiABKAsyFi5nb29nbGUucHJvdG9idWYuVmFsdWU6AjgBIjMKB0NvbnRhY3QSDAoEbmFtZRgBIAEoCRILCgN1cmwYAiABKAkSDQoFZW1haWwYAyABKAkiJAoHTGljZW5zZRIMCgRuYW1lGAEgASgJEgsKA3VybBgCIAEoCSI5ChVFeHRlcm5hbERvY3VtZW50YXRpb24SEwoLZGVzY3JpcHRpb24YASABKAkSCwoDdXJsGAIgASgJIu4BCgZTY2hlbWESSgoLanNvbl9zY2hlbWEYASABKAsyNS5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5KU09OU2NoZW1hEhUKDWRpc2NyaW1pbmF0b3IYAiABKAkSEQoJcmVhZF9vbmx5GAMgASgIElcKDWV4dGVybmFsX2RvY3MYBSABKAsyQC5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5FeHRlcm5hbERvY3VtZW50YXRpb24SDwoHZXhhbXBsZRgGIAEoCUoECAQQBSKiCAoKSlNPTlNjaGVtYRILCgNyZWYYAyABKAkSDQoFdGl0bGUYBSABKAkSEwoLZGVzY3JpcHRpb24YBiABKAkSDwoHZGVmYXVsdBgHIAEoCRIRCglyZWFkX29ubHkYCCABKAgSDwoHZXhhbXBsZRgJIAEoCRITCgttdWx0aXBsZV9vZhgKIAEoARIPCgdtYXhpbXVtGAsgASgBEhkKEWV4Y2x1c2l2ZV9tYXhpbXVtGAwgASgIEg8KB21pbmltdW0YDSABKAESGQoRZXhjbHVzaXZlX21pbmltdW0YDiABKAgSEgoKbWF4X2xlbmd0aBgPIAEoBBISCgptaW5fbGVuZ3RoGBAgASgEEg8KB3BhdHRlcm4YESABKAkSEQoJbWF4X2l0ZW1zGBQgASgEEhEKCW1pbl9pdGVtcxgVIAEoBBIUCgx1bmlxdWVfaXRlbXMYFiABKAgSFgoObWF4X3Byb3BlcnRpZXMYGCABKAQSFgoObWluX3Byb3BlcnRpZXMYGSABKAQSEAoIcmVxdWlyZWQYGiADKAkSDQoFYXJyYXkYIiADKAkSWQoEdHlwZRgjIAMoDjJLLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLkpTT05TY2hlbWEuSlNPTlNjaGVtYVNpbXBsZVR5cGVzEg4KBmZvcm1hdBgkIAEoCRIMCgRlbnVtGC4gAygJEmYKE2ZpZWxkX2NvbmZpZ3VyYXRpb24Y6QcgASgLMkguZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuSlNPTlNjaGVtYS5GaWVsZENvbmZpZ3VyYXRpb24SWQoKZXh0ZW5zaW9ucxgwIAMoCzJFLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLkpTT05TY2hlbWEuRXh0ZW5zaW9uc0VudHJ5Gi0KEkZpZWxkQ29uZmlndXJhdGlvbhIXCg9wYXRoX3BhcmFtX25hbWUYLyABKAkaSQoPRXh0ZW5zaW9uc0VudHJ5EgsKA2tleRgBIAEoCRIlCgV2YWx1ZRgCIAEoCzIWLmdvb2dsZS5wcm90b2J1Zi5WYWx1ZToCOAEidwoVSlNPTlNjaGVtYVNpbXBsZVR5cGVzEgsKB1VOS05PV04QABIJCgVBUlJBWRABEgsKB0JPT0xFQU4QAhILCgdJTlRFR0VSEAMSCAoETlVMTBAEEgoKBk5VTUJFUhAFEgoKBk9CSkVDVBAGEgoKBlNUUklORxAHSgQIARACSgQIAhADSgQIBBAFSgQIEhATSgQIExAUSgQIFxAYSgQIGxAcSgQIHBAdSgQIHRAeSgQIHhAiSgQIJRAqSgQIKhArSgQIKxAuIqACCgNUYWcSDAoEbmFtZRgBIAEoCRITCgtkZXNjcmlwdGlvbhgCIAEoCRJXCg1leHRlcm5hbF9kb2NzGAMgASgLMkAuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuRXh0ZXJuYWxEb2N1bWVudGF0aW9uElIKCmV4dGVuc2lvbnMYBCADKAsyPi5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5UYWcuRXh0ZW5zaW9uc0VudHJ5GkkKD0V4dGVuc2lvbnNFbnRyeRILCgNrZXkYASABKAkSJQoFdmFsdWUYAiABKAsyFi5nb29nbGUucHJvdG9idWYuVmFsdWU6AjgBIuEBChNTZWN1cml0eURlZmluaXRpb25zEl4KCHNlY3VyaXR5GAEgAygLMkwuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2VjdXJpdHlEZWZpbml0aW9ucy5TZWN1cml0eUVudHJ5GmoKDVNlY3VyaXR5RW50cnkSCwoDa2V5GAEgASgJEkgKBXZhbHVlGAIgASgLMjkuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2VjdXJpdHlTY2hlbWU6AjgBIqAGCg5TZWN1cml0eVNjaGVtZRJMCgR0eXBlGAEgASgOMj4uZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2VjdXJpdHlTY2hlbWUuVHlwZRITCgtkZXNjcmlwdGlvbhgCIAEoCRIMCgRuYW1lGAMgASgJEkgKAmluGAQgASgOMjwuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2VjdXJpdHlTY2hlbWUuSW4STAoEZmxvdxgFIAEoDjI+LmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlNlY3VyaXR5U2NoZW1lLkZsb3cSGQoRYXV0aG9yaXphdGlvbl91cmwYBiABKAkSEQoJdG9rZW5fdXJsGAcgASgJEkEKBnNjb3BlcxgIIAEoCzIxLmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlNjb3BlcxJdCgpleHRlbnNpb25zGAkgAygLMkkuZ3JwYy5nYXRld2F5LnByb3RvY19nZW5fb3BlbmFwaXYyLm9wdGlvbnMuU2VjdXJpdHlTY2hlbWUuRXh0ZW5zaW9uc0VudHJ5GkkKD0V4dGVuc2lvbnNFbnRyeRILCgNrZXkYASABKAkSJQoFdmFsdWUYAiABKAsyFi5nb29nbGUucHJvdG9idWYuVmFsdWU6AjgBIksKBFR5cGUSEAoMVFlQRV9JTlZBTElEEAASDgoKVFlQRV9CQVNJQxABEhAKDFRZUEVfQVBJX0tFWRACEg8KC1RZUEVfT0FVVEgyEAMiMQoCSW4SDgoKSU5fSU5WQUxJRBAAEgwKCElOX1FVRVJZEAESDQoJSU5fSEVBREVSEAIiagoERmxvdxIQCgxGTE9XX0lOVkFMSUQQABIRCg1GTE9XX0lNUExJQ0lUEAESEQoNRkxPV19QQVNTV09SRBACEhQKEEZMT1dfQVBQTElDQVRJT04QAxIUChBGTE9XX0FDQ0VTU19DT0RFEAQizQIKE1NlY3VyaXR5UmVxdWlyZW1lbnQSdQoUc2VjdXJpdHlfcmVxdWlyZW1lbnQYASADKAsyVy5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5TZWN1cml0eVJlcXVpcmVtZW50LlNlY3VyaXR5UmVxdWlyZW1lbnRFbnRyeRopChhTZWN1cml0eVJlcXVpcmVtZW50VmFsdWUSDQoFc2NvcGUYASADKAkakwEKGFNlY3VyaXR5UmVxdWlyZW1lbnRFbnRyeRILCgNrZXkYASABKAkSZgoFdmFsdWUYAiABKAsyVy5ncnBjLmdhdGV3YXkucHJvdG9jX2dlbl9vcGVuYXBpdjIub3B0aW9ucy5TZWN1cml0eVJlcXVpcmVtZW50LlNlY3VyaXR5UmVxdWlyZW1lbnRWYWx1ZToCOAEigwEKBlNjb3BlcxJLCgVzY29wZRgBIAMoCzI8LmdycGMuZ2F0ZXdheS5wcm90b2NfZ2VuX29wZW5hcGl2Mi5vcHRpb25zLlNjb3Blcy5TY29wZUVudHJ5GiwKClNjb3BlRW50cnkSCwoDa2V5GAEgASgJEg0KBXZhbHVlGAIgASgJOgI4ASo7CgZTY2hlbWUSCwoHVU5LTk9XThAAEggKBEhUVFAQARIJCgVIVFRQUxACEgYKAldTEAMSBwoDV1NTEARCSFpGZ2l0aHViLmNvbS9ncnBjLWVjb3N5c3RlbS9ncnBjLWdhdGV3YXkvdjIvcHJvdG9jLWdlbi1vcGVuYXBpdjIvb3B0aW9uc2IGcHJvdG8z", [file_google_protobuf_struct]);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Swagger.
 * Use `create(SwaggerSchema)` to create a new message.
 */
export const SwaggerSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 0);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Operation.
 * Use `create(OperationSchema)` to create a new message.
 */
export const OperationSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 1);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Parameters.
 * Use `create(ParametersSchema)` to create a new message.
 */
export const ParametersSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 2);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.HeaderParameter.
 * Use `create(HeaderParameterSchema)` to create a new message.
 */
export const HeaderParameterSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 3);

/**
 * Describes the enum grpc.gateway.protoc_gen_openapiv2.options.HeaderParameter.Type.
 */
export const HeaderParameter_TypeSchema = /*@__PURE__*/
  enumDesc(file_protoc_gen_openapiv2_options_openapiv2, 3, 0);

/**
 * `Type` is a a supported HTTP header type.
 * See https://swagger.io/specification/v2/#parameterType.
 *
 * @generated from enum grpc.gateway.protoc_gen_openapiv2.options.HeaderParameter.Type
 */
export const HeaderParameter_Type = /*@__PURE__*/
  tsEnum(HeaderParameter_TypeSchema);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Header.
 * Use `create(HeaderSchema)` to create a new message.
 */
export const HeaderSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 4);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Response.
 * Use `create(ResponseSchema)` to create a new message.
 */
export const ResponseSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 5);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Info.
 * Use `create(InfoSchema)` to create a new message.
 */
export const InfoSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 6);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Contact.
 * Use `create(ContactSchema)` to create a new message.
 */
export const ContactSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 7);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.License.
 * Use `create(LicenseSchema)` to create a new message.
 */
export const LicenseSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 8);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.ExternalDocumentation.
 * Use `create(ExternalDocumentationSchema)` to create a new message.
 */
export const ExternalDocumentationSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 9);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Schema.
 * Use `create(SchemaSchema)` to create a new message.
 */
export const SchemaSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 10);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.JSONSchema.
 * Use `create(JSONSchemaSchema)` to create a new message.
 */
export const JSONSchemaSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 11);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.JSONSchema.FieldConfiguration.
 * Use `create(JSONSchema_FieldConfigurationSchema)` to create a new message.
 */
export const JSONSchema_FieldConfigurationSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 11, 0);

/**
 * Describes the enum grpc.gateway.protoc_gen_openapiv2.options.JSONSchema.JSONSchemaSimpleTypes.
 */
export const JSONSchema_JSONSchemaSimpleTypesSchema = /*@__PURE__*/
  enumDesc(file_protoc_gen_openapiv2_options_openapiv2, 11, 0);

/**
 * @generated from enum grpc.gateway.protoc_gen_openapiv2.options.JSONSchema.JSONSchemaSimpleTypes
 */
export const JSONSchema_JSONSchemaSimpleTypes = /*@__PURE__*/
  tsEnum(JSONSchema_JSONSchemaSimpleTypesSchema);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Tag.
 * Use `create(TagSchema)` to create a new message.
 */
export const TagSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 12);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.SecurityDefinitions.
 * Use `create(SecurityDefinitionsSchema)` to create a new message.
 */
export const SecurityDefinitionsSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 13);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.SecurityScheme.
 * Use `create(SecuritySchemeSchema)` to create a new message.
 */
export const SecuritySchemeSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 14);

/**
 * Describes the enum grpc.gateway.protoc_gen_openapiv2.options.SecurityScheme.Type.
 */
export const SecurityScheme_TypeSchema = /*@__PURE__*/
  enumDesc(file_protoc_gen_openapiv2_options_openapiv2, 14, 0);

/**
 * The type of the security scheme. Valid values are "basic",
 * "apiKey" or "oauth2".
 *
 * @generated from enum grpc.gateway.protoc_gen_openapiv2.options.SecurityScheme.Type
 */
export const SecurityScheme_Type = /*@__PURE__*/
  tsEnum(SecurityScheme_TypeSchema);

/**
 * Describes the enum grpc.gateway.protoc_gen_openapiv2.options.SecurityScheme.In.
 */
export const SecurityScheme_InSchema = /*@__PURE__*/
  enumDesc(file_protoc_gen_openapiv2_options_openapiv2, 14, 1);

/**
 * The location of the API key. Valid values are "query" or "header".
 *
 * @generated from enum grpc.gateway.protoc_gen_openapiv2.options.SecurityScheme.In
 */
export const SecurityScheme_In = /*@__PURE__*/
  tsEnum(SecurityScheme_InSchema);

/**
 * Describes the enum grpc.gateway.protoc_gen_openapiv2.options.SecurityScheme.Flow.
 */
export const SecurityScheme_FlowSchema = /*@__PURE__*/
  enumDesc(file_protoc_gen_openapiv2_options_openapiv2, 14, 2);

/**
 * The flow used by the OAuth2 security scheme. Valid values are
 * "implicit", "password", "application" or "accessCode".
 *
 * @generated from enum grpc.gateway.protoc_gen_openapiv2.options.SecurityScheme.Flow
 */
export const SecurityScheme_Flow = /*@__PURE__*/
  tsEnum(SecurityScheme_FlowSchema);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.SecurityRequirement.
 * Use `create(SecurityRequirementSchema)` to create a new message.
 */
export const SecurityRequirementSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 15);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.SecurityRequirement.SecurityRequirementValue.
 * Use `create(SecurityRequirement_SecurityRequirementValueSchema)` to create a new message.
 */
export const SecurityRequirement_SecurityRequirementValueSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 15, 0);

/**
 * Describes the message grpc.gateway.protoc_gen_openapiv2.options.Scopes.
 * Use `create(ScopesSchema)` to create a new message.
 */
export const ScopesSchema = /*@__PURE__*/
  messageDesc(file_protoc_gen_openapiv2_options_openapiv2, 16);

/**
 * Describes the enum grpc.gateway.protoc_gen_openapiv2.options.Scheme.
 */
export const SchemeSchema = /*@__PURE__*/
  enumDesc(file_protoc_gen_openapiv2_options_openapiv2, 0);

/**
 * Scheme describes the schemes supported by the OpenAPI Swagger
 * and Operation objects.
 *
 * @generated from enum grpc.gateway.protoc_gen_openapiv2.options.Scheme
 */
export const Scheme = /*@__PURE__*/
  tsEnum(SchemeSchema);

