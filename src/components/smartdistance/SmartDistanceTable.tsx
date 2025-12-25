"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
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

function getStatus(row: SmartDistanceRow) {
  const base = row.rmc_distance_km_p2s
  const gps = row.gps_distance_km_p2s
  const osrm = row.osrm_distance_km_p2s

  if (row.is_split_trip) return "🔁 Split trip"

  if (base && osrm) {
    const diffPct = ((osrm - base) / base) * 100
    if (diffPct > 20) return "❌ OSRM > RMC +20%"
    if (diffPct > 10) return "⚠️ OSRM > RMC +10%"
  }

  if (base && gps) {
    const diffPct = ((gps - base) / base) * 100
    if (Math.abs(diffPct) > 10) return "⚠️ GPS deviate"
  }

  return "✅ OK"
}

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
  th: "px-2 py-2 text-left font-semibold border-b",
  thCenter: "px-2 py-2 text-center font-semibold border-b",
  thSub: "px-2 py-1 text-center text-xs font-medium border-b",
  td: "px-2 py-2 text-center align-middle",
  tdCenter: "px-2 py-2 text-center",
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

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))

  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, page, pageSize])

  return (
    <div className="space-y-4">
      {/* ===== Table ===== */}
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 sticky top-0 z-10">
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

          <tbody>
            {pageData.map(row => (
              <tr
                key={row.TicketNo}
                className="border-t hover:bg-gray-50"
              >
                <td className={styles.td}>
                  <Link
                    href={`/smartdistance/${row.TicketNo}`}
                    className="text-blue-600 underline"
                  >
                    {row.TicketNo}
                  </Link>
                  {row.TicketCreateAt && (
                    <div className="text-xs text-gray-400">
                      {new Date(row.TicketCreateAt).toLocaleString()}
                    </div>
                  )}
                </td>

                <td className={styles.td}>
                  <div>{row.TruckPlateNo}</div>
                  <div className="text-xs text-gray-400">{row.TruckNo}</div>
                </td>

                <td className={`${styles.td} text-xs`}>
                  <div>{row.PlantCode}</div>
                  <div className="text-gray-400">→ {row.SiteCode}</div>
                </td>

                <td className="px-2 py-2 text-right">{fmt(row.rmc_distance_km_p2s)}</td>
                <td className="px-2 py-2 text-right">{fmt(row.rmc_distance_km_s2p)}</td>

                <td className="px-2 py-2 text-right text-blue-600">{fmt(row.gps_distance_km_p2s)}</td>
                <td className="px-2 py-2 text-right text-blue-600">{fmt(row.gps_distance_km_s2p)}</td>

                <td className="px-2 py-2 text-right text-green-600">{fmt(row.osrm_distance_km_p2s)}</td>
                <td className="px-2 py-2 text-right text-green-600">{fmt(row.osrm_distance_km_s2p)}</td>

                <td className={styles.tdCenter}>
                  <Link href={`/smartdistance/${row.TicketNo}`}>🗺️</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Pagination Bar ===== */}
      <div className="flex items-center justify-between">
        {/* Page size */}
        <div className="flex items-center gap-2 text-sm">
          <span>Rows:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map(n => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pager */}
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
              />
            </PaginationItem>

            {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => {
              const p = i + 1
              return (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
