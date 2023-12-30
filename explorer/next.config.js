/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        domains: ['prodlsluxdefibridgesa.blob.core.windows.net', 'devlsluxdefibridgesa.blob.core.windows.net'],
    },
}
if (process.env.NEXT_PUBLIC_APP_BASE_PATH) {
    nextConfig.basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH
}
module.exports = nextConfig