// Library barrel for @luxbridge/app.
//
// This re-export exists so the public SDK (@luxfi/bridge) can lazy-import the
// app as a React component:
//
//   const mod = await import('@luxbridge/app')
//   render(<mod.App />)
//
// Direct consumption of @luxbridge/app by downstream consumers is unsupported
// — the canonical entry is @luxfi/bridge. This file only exists so the SDK
// barrel can find a typed component to mount.
export { App } from './App'
