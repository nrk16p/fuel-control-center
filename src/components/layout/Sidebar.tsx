"use client"

import Link from "next/link"

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-100 h-screen p-4 border-r">
      <h2 className="text-lg font-semibold mb-6">Menu</h2>
      <ul className="space-y-3">
        <li><Link href="/dashboard" className="hover:text-blue-600">📊 Dashboard</Link></li>
        <li><Link href="/vehicles" className="hover:text-blue-600">🚛 Vehicles</Link></li>
        <li><Link href="/fuel" className="hover:text-blue-600">⛽ Fuel Logs</Link></li>
        <li><Link href="/reports" className="hover:text-blue-600">📑 Reports</Link></li>
      </ul>
    </aside>
  )
}
