"use client"

import { useState } from "react"
import { DateRange } from "@/components/ui/daterange"

interface FuelDetectionFilterProps {
  query: (filters: {
    plateDriver: string
    startDate: string
    endDate: string
    statuses: string[]      // ✅ multi
    movingOnly: boolean
  }) => void
  isLoading: boolean
}

export const FuelDetectionFilter = ({ query, isLoading }: FuelDetectionFilterProps) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const startDate = new Date(yesterday)
  startDate.setDate(yesterday.getDate() - 8)

  const [dateRange, setDateRange] = useState({ from: startDate, to: yesterday })
  const [plateDriver, setPlateDriver] = useState("")
  const [statuses, setStatuses] = useState<string[]>([]) // ✅
  const [movingOnly, setMovingOnly] = useState(false)

  const formatDate = (d?: Date) =>
    d
      ? `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${d.getFullYear()}`
      : ""

  const toggleStatus = (status: string) => {
    setStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  const handleApply = () => {
    if (!plateDriver || !dateRange.from || !dateRange.to) {
      return alert("โปรดใส่ข้อมูลให้ครบถ้วน")
    }

    query({
      plateDriver,
      startDate: formatDate(dateRange.from),
      endDate: formatDate(dateRange.to),
      statuses,
      movingOnly,
    })
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex justify-between gap-4 items-center">
      <div className="flex gap-6 items-start">
        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date Range</label>
          <DateRange value={dateRange} onChange={setDateRange} />
        </div>

        {/* Plate */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Plate</label>
          <input
            className="h-9 w-52 rounded-md border px-2 text-sm"
            value={plateDriver}
            onChange={e => setPlateDriver(e.target.value)}
            placeholder="71-8623"
          />
        </div>

        {/* Status (multi) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">สถานะรถ</label>
          {["รถวิ่ง", "จอดรถ", "ดับเครื่อง"].map(s => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={statuses.includes(s)}
                onChange={() => toggleStatus(s)}
              />
              {s}
            </label>
          ))}
        </div>

        {/* movingOnly */}
        <label className="flex items-center gap-2 text-sm mt-6">
          <input
            type="checkbox"
            checked={movingOnly}
            onChange={e => setMovingOnly(e.target.checked)}
          />
          เคลื่อนที่จริง (ความเร็ว &gt; 0)
        </label>
      </div>

      <button
        onClick={handleApply}
        disabled={isLoading}
        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
      >
        {isLoading ? "Loading..." : "Apply"}
      </button>
    </div>
  )
}
