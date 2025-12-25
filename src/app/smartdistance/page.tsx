"use client"

import { useEffect, useMemo, useState } from "react"
import { exportToExcel } from "@/lib/exportToExcel"
import {
  SmartDistanceTable,
  SmartDistanceRow,
} from "@/components/smartdistance/SmartDistanceTable"

/* -------------------------------------------------
   Current month / year (DEFAULT)
------------------------------------------------- */
const now = new Date()
const CURRENT_MONTH = now.getMonth() + 1
const CURRENT_YEAR = now.getFullYear()

export default function SmartDistancePage() {
  const [data, setData] = useState<SmartDistanceRow[]>([])
  const [loading, setLoading] = useState(true)

  /* ---------------- Filters ---------------- */
  const [search, setSearch] = useState("")
  const [month, setMonth] = useState<number | "all">(CURRENT_MONTH)
  const [year, setYear] = useState<number | "all">(CURRENT_YEAR)

  /* -------------------------------------------------
     🔄 Fetch data (SYNC WITH FILTER)
  ------------------------------------------------- */
  useEffect(() => {
    setLoading(true)

    const params = new URLSearchParams()
    if (year !== "all") params.append("year", String(year))
    if (month !== "all") params.append("month", String(month))

    fetch(`/api/smartdistance?${params.toString()}`)
      .then(r => r.json())
      .then((d: SmartDistanceRow[]) => {
        setData(d)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [year, month])

  /* -------------------------------------------------
     Client-side filter (search)
  ------------------------------------------------- */
  const filtered = useMemo(() => {
    if (!search) return data
    const q = search.toLowerCase()

    return data.filter(
      d =>
        d.TicketNo.toLowerCase().includes(q) ||
        d.TruckPlateNo?.toLowerCase().includes(q)
    )
  }, [data, search])

  /* -------------------------------------------------
     Reset
  ------------------------------------------------- */
  const resetFilters = () => {
    setSearch("")
    setMonth(CURRENT_MONTH)
    setYear(CURRENT_YEAR)
  }

  /* -------------------------------------------------
     Export (export filtered)
  ------------------------------------------------- */
  const handleExport = () => {
    exportToExcel(
      filtered,
      `smartdistance_${year !== "all" ? year : "all"}_${
        month !== "all" ? month : "all"
      }.xlsx`
    )
  }

  /* -------------------------------------------------
     Render
  ------------------------------------------------- */
  return (
    <div className="p-8 space-y-6">
      {/* ================= Header ================= */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          🗺️ Smart Distance Summary
        </h1>

        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          📥 Export Excel ({filtered.length})
        </button>
      </div>

      {/* ================= Filters ================= */}
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search Ticket / Plate"
          className="border rounded px-3 py-1"
        />

        <select
          value={month}
          onChange={e =>
            setMonth(
              e.target.value === "all"
                ? "all"
                : Number(e.target.value)
            )
          }
          className="border rounded px-2 py-1"
        >
          <option value="all">All months</option>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={e =>
            setYear(
              e.target.value === "all"
                ? "all"
                : Number(e.target.value)
            )
          }
          className="border rounded px-2 py-1"
        >
          <option value="all">All years</option>
          {Array.from({ length: 5 }).map((_, i) => {
            const y = CURRENT_YEAR - i
            return (
              <option key={y} value={y}>
                {y}
              </option>
            )
          })}
        </select>

        <button
          onClick={resetFilters}
          className="text-blue-600 underline"
        >
          Reset
        </button>
      </div>

      {/* ================= Table ================= */}
      {loading ? (
        <div className="text-gray-500">
          Loading smart distance…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No data for selected filters
        </div>
      ) : (
        <SmartDistanceTable data={filtered} />
      )}
    </div>
  )
}
