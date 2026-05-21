// Side-effect-only CSS imports inside the SDK source tree.
//
// The Vite bundler in downstream consumers handles `.css` imports natively;
// this declaration just keeps `tsc --noEmit` happy when typechecking the SDK
// in isolation.

declare module '*.css' {
  const css: string
  export default css
}
