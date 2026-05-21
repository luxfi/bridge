// Type shim for the workspace's @luxbridge/app entry.
//
// @luxbridge/app is the internal bridge UI (a Vite SPA). Its source uses
// path aliases (`@/*`) that only resolve inside its own tsconfig. From the
// SDK package, we only need the public `App` component type — everything
// else is consumed at runtime via dynamic import.
//
// This shim lets `tsc --noEmit` typecheck @luxfi/bridge in isolation without
// dragging the whole internal-app graph in.

declare module '@luxbridge/app' {
  import type { FC } from 'react'
  export const App: FC
  export default App
}
