"use client"

import { useEffect, useMemo, useState } from "react"
import { OverspeedFilters } from "@/components/overspeed/OverspeedFilter"
import type { Overspeed, SortKey } from "@/components/overspeed/types"
import { OverspeedTable } from "@/components/overspeed/OverspeedTable"
import { exportOverSpeedExcel } from "@/lib/exportOverSpeedExcel"

/* -------------------------------------------------
   🔹 Current month / year (DEFAULT)
------------------------------------------------- */
const now = new Date()
const currentMonth = now.getMonth() + 1 // 1–12
const currentYear = now.getFullYear()

export default function OverspeedPage() {
  const [data, setData] = useState<Overspeed[]>([])
  const [loading, setLoading] = useState(true)

  /* -------------------------------------------------
     🔍 Filters (DEFAULT = current month/year)
  ------------------------------------------------- */
  const [search, setSearch] = useState("")
  const [version, setVersion] = useState<string | "all">("all")
  const [month, setMonth] = useState<number | "all">(currentMonth)
  const [year, setYear] = useState<number | "all">(currentYear)

  /* -------------------------------------------------
     ↕ Sorting
  ------------------------------------------------- */
  const [sortKey, setSortKey] = useState<SortKey>("start_datetime")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  /* -------------------------------------------------
     📄 Pagination
  ------------------------------------------------- */
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  /* -------------------------------------------------
     Fetch data
  ------------------------------------------------- */
  useEffect(() => {
    fetch("/api/overspeed")
      .then((r) => r.json())
      .then((d: Overspeed[]) => {
        setData(d)
        setLoading(false)
        console.log("Overspeed data loaded: ", d)
      })
      .catch(() => setLoading(false))
  }, [])

  /* -------------------------------------------------
     Options
  ------------------------------------------------- */

  const yearOptions = useMemo(
    () =>
      Array.from(new Set(data.map((d) => d.year)))
        .filter((y): y is number => typeof y === "number")
        .sort((a, b) => b - a),
    [data]
  )

  /* -------------------------------------------------
     Filtering
  ------------------------------------------------- */
  const filtered = useMemo(() => {
    let temp = [...data]
    const q = search.toLowerCase()

    if (q) {
      temp = temp.filter(
        (d) =>
          d.vehicle.toLowerCase().includes(q) 
      )
    }
    if (month !== "all") {
      temp = temp.filter((d) => d.month === month)
    }

    if (year !== "all") {
      temp = temp.filter((d) => d.year === year)
    }

    return temp
  }, [data, search, version, month, year])

  /* -------------------------------------------------
     Sorting
  ------------------------------------------------- */
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]

      if (av == null) return 1
      if (bv == null) return -1

      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av
      }

      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortKey, sortDir])

  /* -------------------------------------------------
     Pagination
  ------------------------------------------------- */
  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const paginated = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  )

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  /* -------------------------------------------------
     🔄 Reset filters (BACK TO CURRENT MONTH)
  ------------------------------------------------- */
  const resetFilters = () => {
    setSearch("")
    setMonth(currentMonth)
    setYear(currentYear)
    setPage(1)
  }

  /* -------------------------------------------------
     Export
  ------------------------------------------------- */
  const handleExport = () => {
    exportOverSpeedExcel(
      sorted,
      `overspeed_${year !== "all" ? year : "all"}_${
        month !== "all" ? month : "all"
      }.xlsx`
    )
  }

  /* -------------------------------------------------
     Render
  ------------------------------------------------- */
  return (
    <div className="p-8 space-y-6 mx-auto max-w-7xl">
      {/* Header + Export */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          🏃 Over-Speed Summary
        </h1>

        <button
          onClick={handleExport}
          disabled={sorted.length === 0}
          className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          📥 Export Excel ({sorted.length})
        </button>
      </div>

      {/* Filters */}
      <OverspeedFilters
        search={search}
        setSearch={setSearch}
        month={month}
        setMonth={setMonth}
        year={year}
        setYear={setYear}
        yearOptions={yearOptions}
        onReset={resetFilters}
      />

      {/* Table */}
      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : (
        <OverspeedTable
          data={paginated}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  )
}
