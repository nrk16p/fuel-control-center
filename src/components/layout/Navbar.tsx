"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between bg-white border-b px-6 py-3 shadow-sm">
      {/* Logo */}
      <Link
        href="/"
        className="font-bold text-lg text-blue-600 flex items-center gap-2"
      >
        ⛽ <span>Fuel Control Center</span>
      </Link>

      {/* Navigation */}
      <div className="flex gap-3">
        <Link href="/dashboard">
          <Button variant="outline">📊 Dashboard</Button>
        </Link>

        <Link href="/engineon">
          <Button variant="outline">🚛 Engine-On</Button>
        </Link>

        <Link href="/plants">
          <Button variant="outline">🏭 Plants</Button>
        </Link>

        <Link href="/settings">
          <Button variant="secondary">⚙️ Settings</Button>
        </Link>
      </div>
    </nav>
  )
}
