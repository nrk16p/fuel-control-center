"use client"

import { useState,useEffect, use } from "react"
import { useSearchParams } from "next/navigation"
import { DateRange } from "@/components/ui/daterange"
import PlateDropdown from "./platelist"

interface FuelDetectionFilterProps {
  query: (filters: {
    plateDriver: string
    startDate: string
    endDate: string
    statuses: string[]          // ✅ multi
    movingOnly: boolean
    showReviewed: boolean       // ✅ UX toggle
    showUnreviewed: boolean     // ✅ UX toggle
  }) => void
  isLoading: boolean
}

export function FuelDetectionFilter({ query, isLoading }: FuelDetectionFilterProps) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const startDate = new Date(yesterday)
  startDate.setDate(yesterday.getDate() - 8)

  const [dateRange, setDateRange] = useState({ from: startDate, to: yesterday })
  // ?plate= มาจากช่องค้นหาหน้าแรก — เติมทะเบียนให้ (ยังต้องกดค้นหาเอง)
  const searchParams = useSearchParams()
  const [plateDriver, setPlateDriver] = useState(() => searchParams.get("plate") ?? "")
  const [plateList, setPlateList] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([]) // empty = all
  const [movingOnly, setMovingOnly] = useState(false)

  // ✅ new UX
  const [showReviewed, setShowReviewed] = useState(true)
  const [showUnreviewed, setShowUnreviewed] = useState(true)

useEffect(() => {
  if (!dateRange.from && !dateRange.to) return
   load_plates(dateRange)
 }, [dateRange])

 const load_plates = async (dateRange: { from: Date; to: Date }) => { 

      const params = new URLSearchParams({
      month: [String(dateRange.from.getMonth() + 1), String(dateRange.to.getMonth() + 1)].join(","),
      year: [String(dateRange.from.getFullYear()), String(dateRange.to.getFullYear())].join(","),
    })

    console.log("Fetching Plates:", params.toString())

    const res = await fetch(`/api/fuel-listplate?${params.toString()}`)
    const db = await res.json()
    setPlateList(db)
    console.log("plate:", db)
  }

  const formatDate = (d?: Date) =>
    d
      ? `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${d.getFullYear()}`
      : ""

  const toggleStatus = (s: string) => {
    setStatuses(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]))
  }

  const handleApply = () => {
    if (!plateDriver || !dateRange.from || !dateRange.to) return alert("โปรดใส่ข้อมูลให้ครบถ้วน")
    if (!showReviewed && !showUnreviewed) return alert("ต้องเลือกอย่างน้อย 1 สถานะ (Reviewed/Unreviewed)")

    query({
      plateDriver,
      startDate: formatDate(dateRange.from),
      endDate: formatDate(dateRange.to),
      statuses,
      movingOnly,
      showReviewed,
      showUnreviewed,
    })
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date Range</label>
          <DateRange value={dateRange} onChange={setDateRange} />
        </div>

        <div className="flex flex-col gap-1">
          <PlateDropdown plateList={plateList} value={plateDriver} onChange={setPlateDriver} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">สถานะรถ (เลือกได้หลายค่า)</label>
          <div className="flex flex-wrap gap-2">
            {["รถวิ่ง", "จอดรถ", "ดับเครื่อง"].map(s => (
              <label key={s} className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
                {s}
              </label>
            ))}
            <button
              type="button"
              className="text-xs underline text-gray-500"
              onClick={() => setStatuses([])}
              disabled={isLoading}
            >
              clear
            </button>
          </div>
        </div>

        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={movingOnly} onChange={e => setMovingOnly(e.target.checked)} />
          เฉพาะช่วงรถเคลื่อนที่ (speed &gt; 0)
        </label>

        <button
          onClick={handleApply}
          disabled={isLoading}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          {isLoading ? "Loading..." : "Apply"}
        </button>
      </div>

      {/* ✅ Reviewed / Unreviewed toggles */}
      <div className="flex flex-wrap gap-4 items-center text-sm">
        <div className="font-medium text-gray-700">แสดงช่วง:</div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showUnreviewed}
            onChange={e => setShowUnreviewed(e.target.checked)}
          />
          🔴 Unreviewed
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showReviewed}
            onChange={e => setShowReviewed(e.target.checked)}
          />
          🔵 Reviewed
        </label>
      </div>
    </div>
  )
}
