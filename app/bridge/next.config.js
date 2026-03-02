/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const withMDX = require("@next/mdx")();
const { PHASE_PRODUCTION_SERVER } = require("next/constants");
const path = require("path")
const svgrPluginConfig = require('./next-conf/svgr.next.config')


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
    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: true },
    experimental: {
      outputFileTracingRoot: path.join(__dirname, '../../'),
    },
    basePath: process.env.APP_BASE_PATH || '',
    pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
    reactStrictMode: false,
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
        },
        // White-label tenant logo domains
        { protocol: "https", hostname: "lux.network" },
        { protocol: "https", hostname: "pars.network" },
        { protocol: "https", hostname: "hanzo.ai" },
        { protocol: "https", hostname: "zoo.ngo" },
        { protocol: "https", hostname: "*.lux.network" },
        { protocol: "https", hostname: "*.hanzo.ai" },
        { protocol: "https", hostname: "*.pars.network" },
        { protocol: "https", hostname: "*.zoo.ngo" },
      ],
    },
    compiler: {
      removeConsole: false,
    },
    webpack: (config, { isServer, dev }) => {
      config.cache = false; // Disable Webpack's persistent caching
      config.externals.push("pino-pretty", "lokijs", "encoding");
      config.resolve.fallback = { fs: false, net: false, tls: false };
      // Firebase + @hanzo/auth removed — bridge uses JWT auth, not Firebase.
      // Prevent @luxfi/ui transitive deps from being bundled.
      config.resolve.alias['firebase/app'] = false;
      config.resolve.alias['firebase/auth'] = false;
      config.resolve.alias['firebase/firestore'] = false;
      config.resolve.alias['firebase/analytics'] = false;
      config.resolve.alias['firebase/storage'] = false;
      config.resolve.alias['firebase-admin'] = false;
      config.resolve.alias['firebase-admin/app'] = false;
      config.resolve.alias['@hanzo/auth'] = false;
      config.resolve.alias['@hanzo/commerce'] = false;
      config.resolve.alias['@'] = path.resolve(__dirname, 'src');

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
      '@luxfi/ui',
      '@luxfi/data',
      '@luxfi/menu-icons'
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
