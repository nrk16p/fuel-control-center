"use client"

import { usePathname } from "next/navigation"
import Sidebar from "@/components/layout/Sidebar"

// หน้า /login แสดงเต็มจอ ไม่มี Sidebar/footer
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === "/login") return <>{children}</>

  return (
    <div className="lg:flex">
      <Sidebar />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* 🧭 Main content area */}
        <main className="flex-1 w-full min-w-0 px-4 pt-7 pb-8 sm:px-6 lg:px-10">
          {children}
        </main>

        <footer className="border-t border-line py-4 text-center text-xs text-muted-ink">
          © {new Date().getFullYear()} Fuel Control Center — All rights reserved.
        </footer>
      </div>
    </div>
  )
}
