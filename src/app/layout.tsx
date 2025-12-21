import "./globals.css"
import "leaflet/dist/leaflet.css" // ✅ Global import for Leaflet map styling

import type { Metadata } from "next"
import { Kanit } from "next/font/google"
import Navbar from "@/components/layout/Navbar"

const kanit = Kanit({
  subsets: ["latin"],
  weight: ["400", "700"],
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${kanit.className} bg-gray-50 text-gray-900 min-h-screen flex flex-col`}
      >
        {/* 🔝 Persistent Navbar */}
        <Navbar />

        {/* 🧭 Main content area */}
        <main className="flex-1 mt-10 max-w-7xl mx-auto p-6 w-full">
          {children}
        </main>

        {/* 🦶 Optional Footer */}
        <footer className="text-center text-xs text-gray-500 py-4 border-t mt-6">
          © {new Date().getFullYear()} Fuel Control Center — All rights reserved.
        </footer>
      </body>
    </html>
  )
}
