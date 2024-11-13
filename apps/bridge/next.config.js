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
    experimental: {
      outputFileTracingRoot: __dirname,
    },
    basePath: process.env.APP_BASE_PATH || '',
    pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
    reactStrictMode: true,
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
          protocol: "http",
          hostname: "localhost",
        }
      ],
    },
    compiler: {
      removeConsole: false,
    },
    webpack: (config, { isServer, dev }) => {
      config.externals.push("pino-pretty", "lokijs", "encoding");
      config.resolve.fallback = { fs: false, net: false, tls: false };
      config.resolve.alias['@'] = path.resolve(__dirname, 'src');
      let conf = svgrPluginConfig(config)
      if (dev) {
        conf =  watchPluginConfig(conf)
      }
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
