/**
 * ย้าย API ไป mena-backend-services: ตั้ง BACKEND_API_URL (เช่น https://seahorse-app-o3p3o.ondigitalocean.app)
 * ใน Vercel แล้ว redeploy → /api/* วิ่งไป <BACKEND_API_URL>/api/v1/fuel/* · ไม่ตั้ง = ใช้ route เดิมในแอป
 * ที่ยังอยู่ที่นี่: /api/auth/* (ล็อกอิน NextAuth) · /api/pipeline/* (ใช้ PIPELINE_API_KEY ที่มีแค่บน Vercel)
 * · /api/engineon/besttech (ใช้ BESTTECH_API ที่มีแค่บน Vercel)
 * หมายเหตุ: Next ใช้ next.config.js ก่อน .ts — สองไฟล์นี้ต้องตั้งเหมือนกัน
 */
const backend = process.env.BACKEND_API_URL?.trim().replace(/\/+$/, "")

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async rewrites() {
    if (!backend) return []
    return {
      beforeFiles: [
        {
          source: "/api/:path((?!(?:auth|pipeline|engineon/besttech)(?:/|$)).+)",
          destination: `${backend}/api/v1/fuel/:path`,
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  // ⚙️ Example future-proof experimental flags (safe)
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
