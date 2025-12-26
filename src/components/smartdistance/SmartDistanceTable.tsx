"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/* -------------------------------------------------
   Types
------------------------------------------------- */
export interface SmartDistanceRow {
  TicketNo: string
  TicketCreateAt?: string
  PlantCode: string
  SiteCode: string

  TruckPlateNo?: string
  TruckNo?: string

  rmc_distance_km_p2s?: number | null
  rmc_distance_km_s2p?: number | null

  gps_distance_km_p2s?: number | null
  gps_distance_km_s2p?: number | null

  osrm_distance_km_p2s?: number | null
  osrm_distance_km_s2p?: number | null

  is_split_trip?: boolean
}

/* -------------------------------------------------
   Helpers
------------------------------------------------- */
const fmt = (v?: number | null) =>
  v == null ? "—" : v.toFixed(2)

/* -------------------------------------------------
   Tooltip
------------------------------------------------- */
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-block ml-1">
      <span className="cursor-help text-blue-500 text-xs">ⓘ</span>
      <span className="invisible group-hover:visible absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded bg-gray-900 p-2 text-xs text-white shadow">
        {text}
      </span>
    </span>
  )
}

/* -------------------------------------------------
   Styles
------------------------------------------------- */
const styles = {
  th: "px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b",
  thCenter: "px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider border-b",
  thSub: "px-3 py-2 text-center text-xs font-medium text-gray-600 border-b",
  td: "px-3 py-3 text-sm",
  tdCenter: "px-3 py-3 text-sm text-center",
}

/* -------------------------------------------------
   Pagination helper
------------------------------------------------- */
function getPages(page: number, total: number) {
  const delta = 2
  const pages: (number | "...")[] = []

  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= page - delta && i <= page + delta)
    ) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...")
    }
  }
  return pages
}

/* -------------------------------------------------
   Component
------------------------------------------------- */
interface Props {
  data: SmartDistanceRow[]
}

export function SmartDistanceTable({ data }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  /* reset page when data changes */
  useEffect(() => {
    setPage(1)
  }, [data])

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))

  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, page, pageSize])

  return (
    <div className="space-y-4">
      {/* ===== Table ===== */}
      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th rowSpan={2} className={styles.th}>Ticket</th>
              <th rowSpan={2} className={styles.th}>Truck</th>
              <th rowSpan={2} className={styles.th}>Route</th>

              <th colSpan={2} className={styles.thCenter}>
                RMC <InfoTooltip text="ข้อมูลระยะทางจากตั๋ว" />
              </th>
              <th colSpan={2} className={styles.thCenter}>
                GPS <InfoTooltip text="จาก driving_log" />
              </th>
              <th colSpan={2} className={styles.thCenter}>
                OSRM <InfoTooltip text="คำนวณจาก Map API" />
              </th>

              <th rowSpan={2} className={styles.thCenter}>Map</th>
            </tr>

            <tr>
              <th className={styles.thSub}>P → S</th>
              <th className={styles.thSub}>S → P</th>
              <th className={styles.thSub}>P → S</th>
              <th className={styles.thSub}>S → P</th>
              <th className={styles.thSub}>P → S</th>
              <th className={styles.thSub}>S → P</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {pageData.map(row => (
              <tr key={row.TicketNo} className="hover:bg-gray-50">
                <td className={styles.td}>
                  <Link
                    href={`/smartdistance/${row.TicketNo}`}
                    className="text-blue-600 font-medium"
                  >
                    {row.TicketNo}
                  </Link>
                  {row.TicketCreateAt && (
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(row.TicketCreateAt).toLocaleString("en-GB")}
                    </div>
                  )}
                </td>

                <td className={styles.td}>
                  <div className="font-medium">{row.TruckPlateNo}</div>
                  <div className="text-xs text-gray-500">{row.TruckNo}</div>
                </td>

                <td className={`${styles.td} text-xs`}>
                  <div className="font-medium">{row.PlantCode}</div>
                  <div className="text-gray-500">→ {row.SiteCode}</div>
                </td>

                <td className="px-3 py-3 text-sm text-right">
                  {fmt(row.rmc_distance_km_p2s)}
                </td>
                <td className="px-3 py-3 text-sm text-right">
                  {fmt(row.rmc_distance_km_s2p)}
                </td>

                <td className="px-3 py-3 text-sm text-right text-blue-600">
                  {fmt(row.gps_distance_km_p2s)}
                </td>
                <td className="px-3 py-3 text-sm text-right text-blue-600">
                  {fmt(row.gps_distance_km_s2p)}
                </td>

                <td className="px-3 py-3 text-sm text-right text-green-600">
                  {fmt(row.osrm_distance_km_p2s)}
                </td>
                <td className="px-3 py-3 text-sm text-right text-green-600">
                  {fmt(row.osrm_distance_km_s2p)}
                </td>

                <td className={styles.tdCenter}>
                  <Link href={`/smartdistance/${row.TicketNo}`} className="text-xl">
                    🗺️
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Pagination ===== */}
      <div className="flex items-center justify-between">
        {/* Page size */}
        <div className="flex items-center gap-2 text-sm">
          Rows:
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger className="w-20 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map(n => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
              />
            </PaginationItem>

            {getPages(page, totalPages).map((p, i) =>
              p === "..." ? (
                <PaginationItem key={i}>
                  <span className="px-2 text-gray-400">…</span>
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        <div className="text-sm text-gray-600">
          {data.length} rows
        </div>
      </div>
    </div>
  )
}
