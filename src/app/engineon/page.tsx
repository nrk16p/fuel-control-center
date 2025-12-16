"use client"

import { useEffect, useMemo, useState } from "react"
import { EngineOnTable } from "@/components/engineon/EngineOnTable"
import { EngineOnFilters } from "@/components/engineon/EngineOnFilters"
import type { EngineTripSummary, SortKey } from "@/components/engineon/types"

export default function EngineOnPage() {
  const [data, setData] = useState<EngineTripSummary[]>([])
  const [loading, setLoading] = useState(true)

  // 🔍 filters
  const [search, setSearch] = useState<string>("")
  const [version, setVersion] = useState<string>("all")
  const [month, setMonth] = useState<number | "all">("all")
  const [year, setYear] = useState<number | "all">("all")

  // ↕ sorting
  const [sortKey, setSortKey] = useState<SortKey>("Date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // 📄 pagination
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(25)

  // ─────────────────────────────────────
  // Fetch data
  // ─────────────────────────────────────
  useEffect(() => {
    fetch("/api/engineon/summary")
      .then((r) => r.json())
      .then((d: EngineTripSummary[]) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // ─────────────────────────────────────
  // Options
  // ─────────────────────────────────────
  const versionOptions = useMemo(
    () =>
      Array.from(new Set(data.map((d) => d.version_type))).filter(Boolean),
    [data]
  )

  const yearOptions = useMemo(
    () =>
      Array.from(new Set(data.map((d) => d.year)))
        .filter((y): y is number => typeof y === "number")
        .sort((a, b) => b - a),
    [data]
  )

  // ─────────────────────────────────────
  // Filtering
  // ─────────────────────────────────────
  const filtered = useMemo(() => {
    let temp = [...data]
    const q = search.toLowerCase()

    if (q) {
      temp = temp.filter(
        (d) =>
          d.TruckPlateNo.toLowerCase().includes(q) ||
          d.Supervisor?.toLowerCase().includes(q)
      )
    }

    if (version !== "all") {
      temp = temp.filter((d) => d.version_type === version)
    }

    if (month !== "all") {
      temp = temp.filter((d) => d.month === month)
    }

    if (year !== "all") {
      temp = temp.filter((d) => d.year === year)
    }

    return temp
  }, [data, search, version, month, year])

  // ─────────────────────────────────────
  // Sorting
  // ─────────────────────────────────────
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

  // ─────────────────────────────────────
  // Pagination
  // ─────────────────────────────────────
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

  const resetFilters = () => {
    setSearch("")
    setVersion("all")
    setMonth("all")
    setYear("all")
    setPage(1)
  }

  // ─────────────────────────────────────
  // Render
  // ─────────────────────────────────────
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">🛠️ Engine-On Trip Summary</h1>

      <EngineOnFilters
        search={search}
        setSearch={setSearch}
        version={version}
        setVersion={setVersion}
        month={month}
        setMonth={(v: string | number) => {
          if (v === "all") setMonth("all")
          else setMonth(Number(v))
        }}
        year={year}
        setYear={(v: string | number) => {
          if (v === "all") setYear("all")
          else setYear(Number(v))
        }}
        versionOptions={versionOptions}
        yearOptions={yearOptions}
        onReset={resetFilters}
      />

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : (
        <EngineOnTable
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
