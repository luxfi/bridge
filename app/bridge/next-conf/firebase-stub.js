// Stub for Firebase modules during server-side build
// Firebase is a client-only dependency that fails during Next.js build
// because initializeApp() requires credentials not available at build time.

const noop = () => {}
const noopAsync = () => Promise.resolve()
const noopObj = new Proxy({}, { get: () => noop })

const app = { name: '[DEFAULT]', options: {}, automaticDataCollectionEnabled: false }

module.exports = {
  initializeApp: () => app,
  getApp: () => app,
  getApps: () => [app],
  deleteApp: noopAsync,
  onLog: noop,
  setLogLevel: noop,
  SDK_VERSION: '0.0.0-stub',
}
