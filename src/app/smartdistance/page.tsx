"use client"

import { useEffect, useMemo, useState } from "react"
import { exportToExcel } from "@/lib/exportToExcel"
import {
  SmartDistanceTable,
  SmartDistanceRow,
} from "@/components/smartdistance/SmartDistanceTable"
import {
  SmartDistanceFilters,
  AllOrNumber,
  Company,
} from "@/components/smartdistance/SmartDistanceFilters"

/* -------------------------------------------------
   Current month / year
------------------------------------------------- */
const now = new Date()
const CURRENT_MONTH = now.getMonth() + 1
const CURRENT_YEAR = now.getFullYear()

/* -------------------------------------------------
   Company matcher (FE-only)
------------------------------------------------- */
function matchCompany(
  plantCode: string | undefined,
  company: Company
) {
  if (company === "all") return true
  if (!plantCode) return false

  const v = plantCode.toUpperCase()
  if (company === "Asia")
    return v.startsWith("SU") || v.startsWith("SX")
  if (company === "SCCO")
    return v.startsWith("C")

  return true
}

export default function SmartDistancePage() {
  /* ---------------- Data ---------------- */
  const [data, setData] = useState<SmartDistanceRow[]>([])
  const [loading, setLoading] = useState(true)

  /* ---------------- Filters ---------------- */
  const [search, setSearch] = useState("")
  const [plantCode, setPlantCode] = useState("")
  const [siteCode, setSiteCode] = useState("")
  const [company, setCompany] = useState<Company>("all")

  const [month, setMonth] =
    useState<AllOrNumber>(CURRENT_MONTH)
  const [year, setYear] =
    useState<AllOrNumber>(CURRENT_YEAR)

  /* -------------------------------------------------
     Fetch data (SYNC WITH DATE FILTER)
     → ดึงตาม year / month เท่านั้น
  ------------------------------------------------- */
  useEffect(() => {
    setLoading(true)

    const params = new URLSearchParams()
    if (year !== "all") params.append("year", String(year))
    if (month !== "all") params.append("month", String(month))

    fetch(`/api/smartdistance?${params.toString()}`)
      .then((r) => r.json())
      .then((d: SmartDistanceRow[]) => {
        setData(d)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [year, month])

  /* -------------------------------------------------
     Client-side filter (FE-only)
  ------------------------------------------------- */
  const filtered = useMemo(() => {
    return data.filter((d) => {
      /* 🔍 Search */
      if (search) {
        const q = search.toLowerCase()
        const ok =
          d.TicketNo?.toLowerCase().includes(q) ||
          d.TruckPlateNo?.toLowerCase().includes(q)

        if (!ok) return false
      }

      /* 🏢 Company */
      if (!matchCompany(d.PlantCode, company)) {
        return false
      }

      /* 🏭 Plant prefix */
      if (
        plantCode &&
        !d.PlantCode
          ?.toUpperCase()
          .startsWith(plantCode.toUpperCase())
      ) {
        return false
      }

      /* 📍 Site prefix */
      if (
        siteCode &&
        !d.SiteCode?.startsWith(siteCode)
      ) {
        return false
      }

      return true
    })
  }, [
    data,
    search,
    plantCode,
    siteCode,
    company,
  ])

  /* -------------------------------------------------
     Reset
  ------------------------------------------------- */
  const resetFilters = () => {
    setSearch("")
    setPlantCode("")
    setSiteCode("")
    setCompany("all")
    setMonth(CURRENT_MONTH)
    setYear(CURRENT_YEAR)
  }

  /* -------------------------------------------------
     Export
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
      <SmartDistanceFilters
        search={search}
        setSearch={setSearch}
        plantCode={plantCode}
        setPlantCode={setPlantCode}
        siteCode={siteCode}
        setSiteCode={setSiteCode}
        company={company}
        setCompany={setCompany}
        month={month}
        setMonth={setMonth}
        year={year}
        setYear={setYear}
        yearOptions={Array.from({ length: 5 }).map(
          (_, i) => CURRENT_YEAR - i
        )}
        onReset={resetFilters}
      />

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
