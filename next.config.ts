import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor SDK ships native/agent runtime bits; keep it external to the bundler.
  serverExternalPackages: ["@cursor/sdk"],
};

export default nextConfig;
