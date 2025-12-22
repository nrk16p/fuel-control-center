'use client'

import { useState } from "react"
import { DateRange } from "@/components/ui/daterange"

interface FuelDetectionFilterProps {
  query: (filters: {
    plateDriver: string
    startDate: string
    endDate: string
    status: string
  }) => void
  isLoading: boolean
}

export const FuelDetectionFilter = ({ query, isLoading }: FuelDetectionFilterProps) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const startDate = new Date(yesterday)
  startDate.setDate(yesterday.getDate() - 8)

  const [dateRange, setDateRange] = useState({
    from: startDate,
    to: yesterday,
  })

  const [selectedPlateDriver, setSelectedPlateDriver] = useState("")
  const [status, setStatus] = useState<string>("all")

  const formatDate = (d?: Date) =>
    d
      ? `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${d.getFullYear()}`
      : ""

  const handleReset = () => {
    setDateRange({ from: startDate, to: yesterday })
    setSelectedPlateDriver("")
    setStatus("all")
  }

  const handleApply = () => {
    if (!dateRange.from || !dateRange.to || selectedPlateDriver === "") {
      return alert("โปรดใส่ข้อมูลให้ครบถ้วน")
    }

    query({
      plateDriver: selectedPlateDriver,
      startDate: formatDate(dateRange.from),
      endDate: formatDate(dateRange.to),
      status, // ✅ ส่งสถานะจริงจาก DB
    })
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex justify-between gap-4 items-center">
      {/* LEFT */}
      <div className="flex gap-4 items-start">
        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date Range</label>
          <DateRange
            value={dateRange}
            onChange={setDateRange}
            placeholder="Select date range"
            className="h-9 rounded-md border bg-white px-3 py-1 text-sm shadow-xs"
          />
        </div>

        {/* Plate */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Plate / Driver</label>
          <input
            type="text"
            className="h-9 w-64 rounded-md border bg-white px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2"
            placeholder="Search plate or driver..."
            value={selectedPlateDriver}
            onChange={(e) => setSelectedPlateDriver(e.target.value)}
          />
        </div>

        {/* Status (ใช้ค่าจาก DB  */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">สถานะรถ</label>
          <select
            className="h-9 w-40 rounded-md border bg-white px-2 text-sm shadow-xs"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="รถวิ่ง">รถวิ่ง</option>
            <option value="ดับเครื่อง">ดับเครื่อง</option>
            <option value="จอดรถ">จอดรถ</option>
          </select>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex gap-2 items-center">
        <button
          onClick={handleApply}
          disabled={isLoading}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {isLoading ? "Loading..." : "Apply"}
        </button>

        <button
          onClick={handleReset}
          disabled={isLoading}
          className="h-9 px-4 rounded-md border text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
