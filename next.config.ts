import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // ✅ Allow all origins (only use in local development)
    allowedDevOrigins: ["*"],
  },
}

export default nextConfig
