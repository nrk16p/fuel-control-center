import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

// login ด้วย Google เฉพาะอีเมลบริษัท — แบบเดียวกับ mena-wms (master-sku-web/lib/auth.ts)
const ALLOWED_DOMAIN = "menatransport.co.th"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // hd เป็นแค่ hint ให้ Google กรองหน้าเลือกบัญชี — บังคับจริงที่ signIn callback
      authorization: {
        params: {
          prompt: "select_account",
          hd: ALLOWED_DOMAIN,
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = user?.email ?? profile?.email ?? ""
      const domain = email.split("@")[1]?.toLowerCase()
      if (domain !== ALLOWED_DOMAIN) return false // → /login?error=AccessDenied

      if (account?.provider === "google") {
        const g = profile as { email_verified?: boolean | string; hd?: string } | undefined
        // กันบัญชีที่ตั้งอีเมลเองแต่ยังไม่ยืนยัน
        const verified = g?.email_verified === true || g?.email_verified === "true"
        if (!verified) {
          console.warn(`[auth] blocked unverified google email: ${email}`)
          return "/login?error=EmailNotVerified"
        }
        // hd = Google Workspace ขององค์กร — ถ้ามีต้องตรงกัน (กัน alias จากบัญชีนอก)
        if (g?.hd && g.hd.toLowerCase() !== ALLOWED_DOMAIN) {
          console.warn(`[auth] blocked foreign hosted domain: ${g.hd} (${email})`)
          return false
        }
      }

      console.log(`[auth] google login ${email}`)
      return true
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
}
