import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    authInterrupts: true,
  },
  async headers() {
    const protectedHeaders = [
      { key: "Cache-Control", value: "no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    return [
      { source: "/admin/:path*", headers: protectedHeaders },
      { source: "/api/admin/:path*", headers: protectedHeaders },
    ];
  },
};

export default nextConfig;
