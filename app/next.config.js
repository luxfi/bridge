const withMDX = require('@next/mdx')()
const { PHASE_PRODUCTION_SERVER } = require('next/constants');

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'Content-Security-Policy',
    value: 'frame-ancestors *.immutable.com'
  },
]

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
      domains: ["stagelslayerswapbridgesa.blob.core.windows.net", "bransferstorage.blob.core.windows.net", "devlslayerswapbridgesa.blob.core.windows.net", "prodlslayerswapbridgesa.blob.core.windows.net"],
    },
    compiler: {
      removeConsole: false,
    },
    reactStrictMode: true,
    webpack: (config) => {

      config.resolve.fallback = { fs: false, net: false, tls: false };
      /*
      config.resolve.extensionAlias = {
        ".js": [".js", ".ts"],
        ".jsx": [".jsx", ".tsx"],
      };
      */
      return config;
    },
    productionBrowserSourceMaps: true,
      // https://stackoverflow.com/questions/72621835/how-to-fix-you-may-need-an-appropriate-loader-to-handle-this-file-type-current
    transpilePackages: ['@luxdefi/ui'],

    experimental: { esmExternals: 'loose' },
  }
  if (process.env.APP_BASE_PATH) {
    nextConfig.basePath = process.env.APP_BASE_PATH
  }
  if (phase === PHASE_PRODUCTION_SERVER) {
    nextConfig.headers = async () => {
      return [
        {
          // Apply these headers to all routes in your application.
          source: '/:path*',
          headers: securityHeaders,
        },
      ]
    }
  }

  return withMDX(nextConfig)
}