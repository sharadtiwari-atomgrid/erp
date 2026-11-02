import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Domestic B2B documents (PO, COA, POD, e-way bills…) are uploaded through
  // Server Actions and the proxy, so allow files up to 25 MB.
  experimental: {
    proxyClientMaxBodySize: "25mb",
    serverActions: { bodySizeLimit: "25mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
