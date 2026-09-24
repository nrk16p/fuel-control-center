"use client"

import { usePathname } from "next/navigation"
import Navbar from "@/components/layout/Navbar"

// หน้า /login แสดงเต็มจอ ไม่มี Navbar/footer
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === "/login") return <>{children}</>

  return (
    <>
      {/* 🔝 Persistent Navbar */}
      <Navbar />

      {/* 🧭 Main content area */}
      <main className="flex-1 mt-10 p-6 w-full">
        {children}
      </main>

      {/* 🦶 Optional Footer */}
      <footer className="text-center text-xs text-gray-500 py-4 border-t mt-6">
        © {new Date().getFullYear()} Fuel Control Center — All rights reserved.
      </footer>
    </>
  )
}
