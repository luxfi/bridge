// Comprehensive stub for Firebase modules during server-side build.
// Firebase is a client-only dependency. During Next.js build, server-side
// code evaluation triggers Firebase init which fails without credentials.
// This stub provides safe no-op implementations for all Firebase APIs.

const noop = () => {}
const noopAsync = () => Promise.resolve()
const noopWithReturn = (val) => () => val

const app = {
  name: '[DEFAULT]',
  options: {},
  automaticDataCollectionEnabled: false,
}

// Proxy that returns noop for any property access (handles getFirestore(), getAuth(), etc.)
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
    // firebase/app
    initializeApp: () => app,
    getApp: () => app,
    getApps: () => [app],
    deleteApp: noopAsync,
    onLog: noop,
    setLogLevel: noop,
    SDK_VERSION: '0.0.0-stub',

    // firebase/auth
    getAuth: () => new Proxy({}, handler),
    signInWithEmailAndPassword: noopAsync,
    signOut: noopAsync,
    onAuthStateChanged: noop,
    createUserWithEmailAndPassword: noopAsync,

    // firebase/firestore
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

    // firebase/analytics
    getAnalytics: () => new Proxy({}, handler),
    logEvent: noop,
    isSupported: () => Promise.resolve(false),

    // firebase/storage
    getStorage: () => new Proxy({}, handler),
    ref: noop,
    uploadBytes: noopAsync,
    getDownloadURL: () => Promise.resolve(''),

    // firebase-admin
    credential: { cert: noop, applicationDefault: noop },
    auth: () => new Proxy({}, handler),
    firestore: () => new Proxy({}, handler),
  },
  handler
)

module.exports = stub
module.exports.default = stub
