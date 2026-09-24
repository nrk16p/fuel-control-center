import "./globals.css"
import "leaflet/dist/leaflet.css" // ✅ Global import for Leaflet map styling

import type { Metadata } from "next"
import { Anuphan, Fraunces } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import Providers from "@/components/providers"
import AppShell from "@/components/layout/AppShell"

const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-anuphan",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fraunces",
})

export const metadata: Metadata = {
  title: "Fuel Control Center",
  description: "Monitor and analyze fuel usage across fleet vehicles in real time",
  icons: {
    icon: "/favicon.ico",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${anuphan.variable} ${fraunces.variable} font-sans bg-cream text-ink min-h-screen`}
      >
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>

        <Analytics />
      </body>
    </html>
  )
}
