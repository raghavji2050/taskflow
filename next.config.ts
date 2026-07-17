import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["firebase-admin"],
  async rewrites() {
    return [
      // Standard FCM SW path (browsers + Firebase expect this at site root).
      { source: "/firebase-messaging-sw.js", destination: "/api/push-sw" },
    ];
  },
};

export default nextConfig;
