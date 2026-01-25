"use client"

import React, { useEffect } from "react"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Overspeed, SortKey } from "./types"

/* ================= Types ================= */

interface ThProps {
  children: React.ReactNode
  onClick?: () => void
  center?: boolean
}

interface TdProps {
  children: React.ReactNode
  center?: boolean
}

interface Props {
  data: Overspeed[]
  sortKey: SortKey
  sortDir: "asc" | "desc"
  onSort: (k: SortKey) => void
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (p: number) => void
  onPageSizeChange: (n: number) => void
}

/* ================= Component ================= */

export function OverspeedTable({
  data,
  onSort,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: Props) {

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "-"
    return new Date(d).toLocaleDateString("th-TH")
  }

  const formatNumber = (n: number | null | undefined, decimals = 2) => {
    if (n == null || isNaN(n)) return "-"
    return n.toFixed(decimals)
  }

  const formatString = (s: string | null | undefined) => {
    if (!s) return "-"
    return s
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <Th onClick={() => onSort("vehicle")}>ทะเบียน</Th>
            <Th onClick={() => onSort("start_datetime")}>วันที่เริ่ม</Th>
            <Th onClick={() => onSort("end_datetime")}>วันที่สิ้นสุด</Th>

            <Th>duration (นาที)</Th>
            <Th>sum_distance (กม.)</Th>

            <Th onClick={() => onSort("avg_speed")}>avg_speed</Th>
            <Th onClick={() => onSort("max_speed")}>max_speed</Th>

            <Th onClick={() => onSort("w_speed")}>w_speed</Th>

            <Th onClick={() => onSort("speed_group")}>speed_group</Th>
          </tr>
        </thead>

        <tbody>
          {data.map((r) => {

            return (
              <tr key={r._id} className="border-t hover:bg-gray-50">

                {/* Plate */}
                <Td>{formatString(r.vehicle)}</Td>

                {/* Date */}
                <Td>{formatDate(r.start_datetime)}</Td>
                <Td>{formatDate(r.end_datetime)}</Td>

                {/* Duration */}
                <Td>{formatNumber(r.duration_minutes)}</Td>

                {/* sum_distance */}
                <Td>{formatNumber(r.sum_distance_km)}</Td>

                {/* Speed All */}
                <Td>{formatNumber(r.avg_speed)}</Td>
                <Td>{formatNumber(r.max_speed)}</Td>
                <Td>{formatNumber(r.w_speed)}</Td>
                <Td>{formatString(r.speed_group)}</Td>   

              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex justify-between items-center p-4 border-t bg-gray-50 text-sm">
        <span>
          แสดง {(page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, total)} จาก {total}
        </span>

        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onPageSizeChange(Number(e.target.value))
            }
            className="border rounded px-2 py-1"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => onPageChange(1)}>⏮</Button>
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => onPageChange(page - 1)}>◀</Button>
          <span>{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>▶</Button>
          <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => onPageChange(totalPages)}>⏭</Button>
        </div>
      </div>
    </div>
  )
}

/* ================= Helpers ================= */

function Th({ children, onClick, center }: ThProps) {
  return (
    <th
      onClick={onClick}
      className={`p-3 select-none ${
        onClick ? "cursor-pointer" : ""
      } ${center ? "text-center" : "text-left"}`}
    >
      <div className="flex items-center gap-1">
        {children}
        {onClick && <ArrowUpDown size={14} className="text-gray-400" />}
      </div>
    </th>
  )
}

function Td({ children, center }: TdProps) {
  return (
    <td className={`p-3 ${center ? "text-center" : ""}`}>
      {children}
    </td>
  )
}
