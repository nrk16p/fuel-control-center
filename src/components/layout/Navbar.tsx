"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import dayjs from "dayjs"

interface HealthStatus {
  status?: string
  updated_at?: string
}

export default function Navbar() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)

  /* ───────────────── Fetch health / last update ───────────────── */
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(
          "https://api-engineon.onrender.com/healthz",
          { cache: "no-store" }
        )
        const json = await res.json()

        setHealth({
          status: json.status ?? "ok",
          updated_at: json.updated_at ?? new Date().toISOString(),
        })
      } catch {
        setHealth({ status: "down" })
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
  }, [])

  /* ───────────────── Helpers ───────────────── */
  const StatusDot = () => {
    if (loading) return <span className="text-gray-400">●</span>
    if (health?.status === "ok")
      return <span className="text-green-500">●</span>
    return <span className="text-red-500">●</span>
  }

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
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="outline">📊 Dashboard</Button>
        </Link>

        <Link href="/engineon">
          <Button variant="outline">🚛 Engine-On</Button>
        </Link>

        <Link href="/pipeline">
          <Button variant="outline">🧭 Pipeline</Button>
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
