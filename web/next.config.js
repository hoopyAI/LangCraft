/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true, // Allow importing from outside the root directory
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@core': require('path').resolve(__dirname, '../src'),
    };

    return config;
  },
};

module.exports = nextConfig;
