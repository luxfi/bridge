// @luxfi/utila ships no .d.ts (dist is a plain rollup CJS/ESM bundle), so
// tsc's structural JS inference has to reconstruct its exports. tsgo's JS
// inference misses createGrpcClient and serviceAccountAuthStrategy even
// though they are exported identically to createHttpClient (which it does
// find) — a native-compiler JS-inference gap, not a source error. Both
// call sites here already treat the client as `any`, so a loose ambient
// signature is enough to match tsc's prior behavior.
declare module "@luxfi/utila" {
  export function createGrpcClient(options: any): any
  export function serviceAccountAuthStrategy(options: any): any
}
