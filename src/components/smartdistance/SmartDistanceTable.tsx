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
  th: "px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200",
  thCenter: "px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200",
  thSub: "px-3 py-2 text-center text-xs font-medium text-gray-600 border-b border-gray-200",
  td: "px-3 py-3 text-sm",
  tdCenter: "px-3 py-3 text-sm text-center",
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
      <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
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

              <th rowSpan={2} className={styles.thCenter}>Status</th>
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

          <tbody className="bg-white divide-y divide-gray-200">
            {pageData.map(row => (
              <tr
                key={row.TicketNo}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className={styles.td}>
                  <Link
                    href={`/smartdistance/${row.TicketNo}`}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {row.TicketNo}
                  </Link>
                  {row.TicketCreateAt && (
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(row.TicketCreateAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  )}
                </td>

                <td className={styles.td}>
                  <div className="font-medium text-gray-900">{row.TruckPlateNo}</div>
                  <div className="text-xs text-gray-500">{row.TruckNo}</div>
                </td>

                <td className={`${styles.td} text-xs`}>
                  <div className="font-medium text-gray-900">{row.PlantCode}</div>
                  <div className="text-gray-500">→ {row.SiteCode}</div>
                </td>

                <td className="px-3 py-3 text-sm text-right text-gray-900">
                  {fmt(row.rmc_distance_km_p2s)}
                </td>
                <td className="px-3 py-3 text-sm text-right text-gray-900">
                  {fmt(row.rmc_distance_km_s2p)}
                </td>

                <td className="px-3 py-3 text-sm text-right text-blue-600 font-medium">
                  {fmt(row.gps_distance_km_p2s)}
                </td>
                <td className="px-3 py-3 text-sm text-right text-blue-600 font-medium">
                  {fmt(row.gps_distance_km_s2p)}
                </td>

                <td className="px-3 py-3 text-sm text-right text-green-600 font-medium">
                  {fmt(row.osrm_distance_km_p2s)}
                </td>
                <td className="px-3 py-3 text-sm text-right text-green-600 font-medium">
                  {fmt(row.osrm_distance_km_s2p)}
                </td>

                <td className={`${styles.tdCenter} text-sm`}>
                  <span className="inline-flex items-center">
                    {getStatus(row)}
                  </span>
                </td>

                <td className={styles.tdCenter}>
                  <Link 
                    href={`/smartdistance/${row.TicketNo}`}
                    className="text-xl hover:scale-110 inline-block transition-transform"
                  >
                    🗺️
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Pagination Bar ===== */}
      <div className="flex items-center justify-between">
        {/* Page size */}
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="font-medium">Rows:</span>
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

        {/* Pager */}
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>

            {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => {
              const p = i + 1
              return (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        {/* Total count */}
        <div className="text-sm text-gray-600">
          Showing <span className="font-medium">{(page - 1) * pageSize + 1}</span> to{' '}
          <span className="font-medium">{Math.min(page * pageSize, data.length)}</span> of{' '}
          <span className="font-medium">{data.length}</span> results
        </div>
      </div>
    </div>
  )
}