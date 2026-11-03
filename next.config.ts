import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Cache Components are disabled for the Cloudflare Workers deployment:
  // the current Next.js/Workers runtime combination can hang while rendering.
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
