"use client"

import { useState } from "react"
import type { CoverageRow, CoverageStatus } from "@/lib/fuel-types"
import { COVERAGE_LABEL, SOURCE_LABEL } from "./labels"

type Props = { date: string; rows: CoverageRow[]; loading: boolean; onDateChange: (date: string) => void }

const STATUSES: CoverageStatus[] = ["no_data", "offline", "no_sensor", "stuck", "ok"]

/** สถานะข้อมูลรายคัน: แหล่ง, ข้อมูลล่าสุด, สถานะ, ขนาดถังและที่มา */
export function DataStatusTable({ date, rows, loading, onDateChange }: Props) {
  const [status, setStatus] = useState<CoverageStatus | "">("")
  const counts = STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length] as const)
  const shown = status ? rows.filter((r) => r.status === status) : rows
  return (
    <section className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">สถานะข้อมูล GPS รายคัน</h3>
        <label className="text-[12px] text-muted-ink">
          วันที่
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามสถานะ">
        <button type="button" aria-pressed={status === ""} onClick={() => setStatus("")} className="h-8 rounded-full border border-line-input px-3 text-[12px]">
          ทั้งหมด {rows.length}
        </button>
        {counts.map(([s, n]) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`h-8 rounded-full border border-line-input px-3 text-[12px] ${status === s ? "bg-mint text-forest-dark" : ""}`}
          >
            {COVERAGE_LABEL[s]} {n}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="h-40 animate-pulse rounded-[14px] bg-line" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-muted-ink">
              <tr>
                <th className="py-1 pr-3 font-medium">ทะเบียน</th>
                <th className="py-1 pr-3 font-medium">รหัส</th>
                <th className="py-1 pr-3 font-medium">แหล่ง</th>
                <th className="py-1 pr-3 font-medium">สถานะ</th>
                <th className="py-1 pr-3 font-medium">นาทีที่มีข้อมูล</th>
                <th className="py-1 pr-3 font-medium">ค่าน้ำมันใช้ได้</th>
                <th className="py-1 pr-3 font-medium">ข้อมูลล่าสุด</th>
                <th className="py-1 pr-3 font-medium">ระยะวิ่ง</th>
                <th className="py-1 font-medium">ถัง</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {shown.map((r) => (
                <tr key={`${r.plate}|${r.source}`} className="border-t border-line">
                  <td className="py-1 pr-3">{r.plate}</td>
                  <td className="py-1 pr-3">{r.truck_code ?? "–"}</td>
                  <td className="py-1 pr-3">{SOURCE_LABEL[r.source]}</td>
                  <td className="py-1 pr-3">{COVERAGE_LABEL[r.status]}</td>
                  <td className="py-1 pr-3">{r.minutes}</td>
                  <td className="py-1 pr-3">{Math.round(r.fuel_valid_share * 100)}%</td>
                  <td className="py-1 pr-3">{r.last ?? "–"}</td>
                  <td className="py-1 pr-3">{r.moved_km.toFixed(1)} กม.</td>
                  <td className="py-1">
                    {r.tank_l} L · {r.tank_from}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-3 text-[13px] text-muted-ink">ไม่มีข้อมูลของวันที่นี้</p>}
        </div>
      )}
    </section>
  )
}
