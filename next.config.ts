import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/biz/scan",
        destination: "/scan",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // The /r/[slug] smart URL resolves to live, claim-state-dependent
        // content (and a 307 redirect when exactly one drop is claimable).
        // Force `no-store` so a CDN never caches a redirect/list that goes
        // stale the moment a drop sells out or a new one goes live.
        source: "/r/:slug",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
