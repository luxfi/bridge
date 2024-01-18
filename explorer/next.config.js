/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: "stagelslayerswapbridgesa.blob.core.windows.net"
        },
        {
          protocol: 'https',
          hostname: "bransferstorage.blob.core.windows.net"
        },
        {
          protocol: 'https',
          hostname: "devlslayerswapbridgesa.blob.core.windows.net"
        },
        {
          protocol: 'https',
          hostname: "prodlslayerswapbridgesa.blob.core.windows.net"
        },
        {
          protocol: "http",
          hostname: "localhost",
        }
      ],
    },
}
if (process.env.NEXT_PUBLIC_APP_BASE_PATH) {
    nextConfig.basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH
}
module.exports = nextConfig