/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  webpack: (config, { dev }) => {
    // This repo lives inside a OneDrive folder, which syncs `.next` while
    // webpack is still writing to it. That corrupts the on-disk cache and
    // surfaces as ENOENT renames on *.pack.gz, phantom "Cannot find module
    // './638.js'", or truncated bundles. Keeping the dev cache in memory costs
    // a slightly slower cold start and removes the whole class of failure.
    if (dev) config.cache = { type: "memory" };
    return config;
  },
};

export default nextConfig;
