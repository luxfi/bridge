// Stub for Firebase modules during server-side build.
// A transitive dependency imports Firebase during SSR page data collection.
// This provides safe no-op implementations to prevent build failures.

const noop = () => {}
const noopAsync = () => Promise.resolve()

const app = {
  name: '[DEFAULT]',
  options: {},
  automaticDataCollectionEnabled: false,
}

const handler = {
  get(target, prop) {
    if (prop === '__esModule') return true
    if (prop === 'default') return target
    if (prop in target) return target[prop]
    return noop
  },
}

const stub = new Proxy(
  {
    initializeApp: () => app,
    getApp: () => app,
    getApps: () => [app],
    deleteApp: noopAsync,
    onLog: noop,
    setLogLevel: noop,
    SDK_VERSION: '0.0.0-stub',
    getAuth: () => new Proxy({}, handler),
    signInWithEmailAndPassword: noopAsync,
    signOut: noopAsync,
    onAuthStateChanged: noop,
    createUserWithEmailAndPassword: noopAsync,
    getFirestore: () => new Proxy({}, handler),
    collection: noop,
    doc: noop,
    getDoc: noopAsync,
    getDocs: noopAsync,
    setDoc: noopAsync,
    addDoc: noopAsync,
    query: noop,
    where: noop,
    orderBy: noop,
    limit: noop,
    onSnapshot: noop,
    getAnalytics: () => new Proxy({}, handler),
    logEvent: noop,
    isSupported: () => Promise.resolve(false),
    getStorage: () => new Proxy({}, handler),
    ref: noop,
    uploadBytes: noopAsync,
    getDownloadURL: () => Promise.resolve(''),
    credential: { cert: noop, applicationDefault: noop },
    auth: () => new Proxy({}, handler),
    firestore: () => new Proxy({}, handler),
  },
  handler
)

module.exports = stub
module.exports.default = stub
