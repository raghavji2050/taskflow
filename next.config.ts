import type { NextConfig } from "next";
import { buildSameOriginFrameHeaders, buildSecurityHeaders } from "./lib/security-headers";

const dev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [
      { source: "/:path*", headers: buildSecurityHeaders({ dev }) },
      // Later entries override earlier ones for the same header key.
      { source: "/api/blob", headers: buildSameOriginFrameHeaders({ dev }) },
      { source: "/uploads/:path*", headers: buildSameOriginFrameHeaders({ dev }) },
    ];
  },
  async rewrites() {
    return [
      // Standard FCM SW path (browsers + Firebase expect this at site root).
      { source: "/firebase-messaging-sw.js", destination: "/api/push-sw" },
    ];
  },
};

export default nextConfig;
