/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const withMDX = require("@next/mdx")();
const { PHASE_PRODUCTION_SERVER } = require("next/constants");
const path = require("path")

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
      ],
    },
    compiler: {
      removeConsole: false,
    },
    reactStrictMode: false,
    webpack: (config, { isServer }) => {
      config.resolve.fallback = { fs: false, net: false, tls: false };
      if (!isServer) {
        config.resolve.alias['@'] = path.resolve(__dirname);
      }
      return config;
    },
    productionBrowserSourceMaps: true,
    // https://stackoverflow.com/questions/72621835/how-to-fix-you-may-need-an-appropriate-loader-to-handle-this-file-type-current
    transpilePackages: ["@luxdefi/ui"],
  };
  if (process.env.APP_BASE_PATH) {
    nextConfig.basePath = process.env.APP_BASE_PATH;
  }
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
