const withMDX = require("@next/mdx")();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "stagelslayerswapbridgesa.blob.core.windows.net",
      },
      {
        protocol: "https",
        hostname: "bransferstorage.blob.core.windows.net",
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
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "cdn.lux.network",
      },
    ],
  },
  // https://stackoverflow.com/questions/72621835/how-to-fix-you-may-need-an-appropriate-loader-to-handle-this-file-type-current
  transpilePackages: ["@luxdefi/ui"],
  productionBrowserSourceMaps: true,
};
if (process.env.NEXT_PUBLIC_APP_BASE_PATH) {
  nextConfig.basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH;
}
module.exports = withMDX(nextConfig);
