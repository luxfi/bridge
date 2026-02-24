/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const withMDX = require("@next/mdx")();
const { PHASE_PRODUCTION_SERVER } = require("next/constants");
const path = require("path")
const svgrPluginConfig = require('./next-conf/svgr.next.config')
const watchPluginConfig = require('./next-conf/watch.next.config')


const securityHeaders = [
  // { key: "Access-Control-Allow-Origin", value: "*" },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors *.immutable.com",
  },
];

module.exports = (phase, { defaultConfig }) => {
  /**
   * @type {import('next').NextConfig}
   */
  const nextConfig = {
    output: 'standalone',
    experimental: {
      outputFileTracingRoot: path.join(__dirname, '../../'),
    },
    basePath: process.env.APP_BASE_PATH || '',
    pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
    reactStrictMode: false,
    i18n: {
      locales: ["en"],
      defaultLocale: "en",
    },
    images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "stagelslayerswapbridgesa.blob.core.windows.net",
        },
        {
          protocol: "https",
          hostname: "devlslayerswapbridgesa.blob.core.windows.net",
        },
        {
          protocol: "https",
          hostname: "prodlslayerswapbridgesa.blob.core.windows.net",
        },
        {
          protocol: "https",
          hostname: "cdn.lux.network",
        },
        {
          protocol: 'https',
          hostname: 'img.youtube.com',
          pathname: '**',
        },
        {
          protocol: "https",
          hostname: "arweave.net",
        },
        {
          protocol: "http",
          hostname: "localhost",
        }
      ],
    },
    compiler: {
      removeConsole: false,
    },
    webpack: (config, { isServer, dev }) => {
      config.cache = false; // Disable Webpack's persistent caching
      config.externals.push("pino-pretty", "lokijs", "encoding");
      config.resolve.fallback = { fs: false, net: false, tls: false };
      config.resolve.alias['@'] = path.resolve(__dirname, 'src');

      // Stub ALL Firebase modules during server-side build to prevent
      // "default Firebase app does not exist" errors at build time.
      // Firebase is client-only; real modules load at runtime in browser.
      if (isServer) {
        const firebaseStub = path.resolve(__dirname, 'next-conf/firebase-stub.js');
        // Match all firebase/* and @firebase/* import paths
        config.resolve.alias['firebase/app'] = firebaseStub;
        config.resolve.alias['firebase/firestore'] = firebaseStub;
        config.resolve.alias['firebase/auth'] = firebaseStub;
        config.resolve.alias['firebase/analytics'] = firebaseStub;
        config.resolve.alias['firebase/storage'] = firebaseStub;
        config.resolve.alias['firebase/messaging'] = firebaseStub;
        config.resolve.alias['firebase/functions'] = firebaseStub;
        config.resolve.alias['firebase/database'] = firebaseStub;
        config.resolve.alias['firebase/performance'] = firebaseStub;
        config.resolve.alias['firebase/remote-config'] = firebaseStub;
        config.resolve.alias['firebase'] = firebaseStub;
        config.resolve.alias['@firebase/app'] = firebaseStub;
        config.resolve.alias['@firebase/auth'] = firebaseStub;
        config.resolve.alias['@firebase/firestore'] = firebaseStub;
        config.resolve.alias['@firebase/analytics'] = firebaseStub;
        config.resolve.alias['@firebase/storage'] = firebaseStub;
        config.resolve.alias['@firebase/messaging'] = firebaseStub;
        config.resolve.alias['@firebase/functions'] = firebaseStub;
        config.resolve.alias['@firebase/database'] = firebaseStub;
        config.resolve.alias['@firebase/app-compat'] = firebaseStub;
        config.resolve.alias['@firebase/auth-compat'] = firebaseStub;
        config.resolve.alias['@firebase/firestore-compat'] = firebaseStub;
        config.resolve.alias['firebase-admin'] = firebaseStub;
        config.resolve.alias['firebase-admin/app'] = firebaseStub;
        config.resolve.alias['firebase-admin/auth'] = firebaseStub;
        config.resolve.alias['firebase-admin/firestore'] = firebaseStub;
      }

      let conf = svgrPluginConfig(config)
      // if (dev) {
      //   conf =  watchPluginConfig(conf)
      // }
      return conf
    },
    productionBrowserSourceMaps: true,
    // https://stackoverflow.com/questions/72621835/how-to-fix-you-may-need-an-appropriate-loader-to-handle-this-file-type-current
    transpilePackages: [
      '@hanzo/ui',
      '@hanzo/auth',
      '@hanzo/commerce',
      '@luxfi/ui',
      '@luxfi/data'
    ],
  };

  if (phase === PHASE_PRODUCTION_SERVER) {
    nextConfig.headers = async () => {
      return [
        {
          // Apply these headers to all routes in your application.
          source: "/:path*",
          headers: securityHeaders,
        },
      ];
    };
  }

  return withMDX(nextConfig);
};
