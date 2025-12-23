"use client"

import React from "react"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { EngineTripSummary, SortKey } from "./types"

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
  data: EngineTripSummary[]
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

export function EngineOnTable({
  data,
  sortKey,
  sortDir,
  onSort,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("th-TH")

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <Th onClick={() => onSort("Supervisor")}>Driver</Th>
            <Th onClick={() => onSort("TruckPlateNo")}>ทะเบียน</Th>
            <Th onClick={() => onSort("Date")}>วันที่</Th>
            <Th>Engine-On (Not Plant)</Th>
            <Th>Lite (Not Plant)</Th>

            <Th onClick={() => onSort("TotalMinutes")}>Engine-On</Th>

            <Th>สำรองเวลาโหลด</Th>
            <Th>ส่วนต่าง</Th>

            <Th onClick={() => onSort("#trip")}>Trip</Th>

            <Th onClick={() => onSort("จำนวนลิตร")}>Lite</Th>

            <Th>Version</Th>
            <Th center>Map</Th>
          </tr>
        </thead>

        <tbody>
          {data.map((r) => {
            const diffMin = r["ส่วนต่าง"] ?? 0
            const diffStr = r["ส่วนต่าง_hhmm"]
            const reserve = r["สำรองเวลาโหลด"]

            const liter = r["จำนวนลิตร"]

            const notPlantStr = r.not_plant_hhmm
            const notPlantLiter = r.not_plant_liter

            return (
              <tr key={r._id} className="border-t hover:bg-gray-50">
                <Td>{r.Supervisor || "-"}</Td>
                <Td>{r.TruckPlateNo}</Td>
                <Td>{formatDate(r.Date)}</Td>

                {/* Engine-On (Plant) */}
                <Td>{r.Duration_str ?? "-"}</Td>

                {/* Engine-On (Not Plant) */}
                <Td>
                  {notPlantStr ? (
                    <span className="text-purple-600 font-medium">
                      {notPlantStr}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </Td>

                {/* สำรองเวลาโหลด */}
                <Td>
                  {reserve != null ? (
                    <span className="text-blue-600 font-medium">
                      {reserve.toFixed(0)} นาที
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </Td>

                {/* ส่วนต่าง */}
                <Td>
                  {diffStr ? (
                    <span
                      className={`font-semibold ${
                        diffMin > 0
                          ? "text-red-600"
                          : "text-gray-500"
                      }`}
                    >
                      {diffStr}
                      {diffMin > 0 && " ⚠️"}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </Td>

                {/* Trip */}
                <Td>{r["#trip"] ?? "-"}</Td>

                {/* Fuel (Plant) */}
                <Td>
                  {liter != null ? (
                    <span
                      className={`font-semibold ${
                        liter > 2
                          ? "text-red-600"
                          : "text-yellow-600"
                      }`}
                    >
                      {liter.toFixed(2)} L
                      {liter > 2 && " 🔥"}
                    </span>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </Td>

                {/* Fuel (Not Plant) */}
                <Td>
                  {notPlantLiter != null ? (
                    <span
                      className={`font-semibold ${
                        notPlantLiter > 2
                          ? "text-red-600"
                          : "text-purple-600"
                      }`}
                    >
                      {notPlantLiter.toFixed(2)} L
                      {notPlantLiter > 2 && " ⚠️"}
                    </span>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </Td>

                <Td>{r.version_type}</Td>

                {/* Map */}
                <Td center>
                  <a
                    href={`/engineon/${r._id}`}
                    className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100"
                    title="View map"
                  >
                    🗺️
                  </a>
                </Td>
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
