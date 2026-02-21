/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:3100',
    NEXT_PUBLIC_STATS_TOKEN: process.env.NEXT_PUBLIC_STATS_TOKEN || '',
  },
};

module.exports = nextConfig;
