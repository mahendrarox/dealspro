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
      {
        // The intake URL carries a signed credential in its path and
        // renders restaurant-specific content. Never let a CDN, a proxy,
        // or a shared browser cache hold on to it, and keep it out of
        // every index.
        source: "/intake/:token",
        headers: [
          { key: "Cache-Control", value: "no-store, private" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
