import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker image
  // is small and runs anywhere with `node server.js`.
  output: "standalone",
};

export default nextConfig;
