'use client'

import { useState } from "react"
import { DateRange } from "@/components/ui/daterange"

interface FuelDetectionFilterProps {
  query: (filters: {
    plateDriver: string
    startDate: string
    endDate: string
    status: string
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
  const [status, setStatus] = useState("all")
  const [movingOnly, setMovingOnly] = useState(false)

  const formatDate = (d?: Date) =>
    d
      ? `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${d.getFullYear()}`
      : ""

  const handleApply = () => {
    if (!plateDriver || !dateRange.from || !dateRange.to) {
      return alert("โปรดใส่ข้อมูลให้ครบถ้วน")
    }

    query({
      plateDriver,
      startDate: formatDate(dateRange.from),
      endDate: formatDate(dateRange.to),
      status,
      movingOnly, // ✅ ส่งไป BE
    })
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex justify-between gap-4 items-center">
      <div className="flex gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date Range</label>
          <DateRange value={dateRange} onChange={setDateRange} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Plate / Driver</label>
          <input
            className="h-9 w-60 rounded-md border px-2 text-sm"
            value={plateDriver}
            onChange={e => setPlateDriver(e.target.value)}
            placeholder="71-8623"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">สถานะรถ</label>
          <select
            className="h-9 w-40 rounded-md border px-2 text-sm"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="รถวิ่ง">รถวิ่ง</option>
            <option value="ดับเครื่อง">ดับเครื่อง</option>
            <option value="จอด">จอด</option>
            <option value="เดินเครื่อง">เดินเครื่อง</option>
          </select>
        </div>

        {/* ✅ Separate filter */}
        <label className="flex items-center gap-2 text-sm mt-6">
          <input
            type="checkbox"
            checked={movingOnly}
            onChange={e => setMovingOnly(e.target.checked)}
          />
          แสดงเฉพาะช่วงรถเคลื่อนที่ (ความเร็ว &gt; 0)
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
