"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { runEngineOnTripSummary } from "@/lib/etlApi"

interface Props {
  open: boolean
  onClose: () => void
  // ✅ ส่ง function กลับไป
  onRun: (run: () => Promise<{ job_id: string }>) => void
}

export default function RunTripSummaryModal({
  open,
  onClose,
  onRun,
}: Props) {
  const [year, setYear] = useState(2025)
  const [month, setMonth] = useState(12)

  const handleConfirm = () => {
    if (!year || !month) {
      alert("❗ Please select year and month")
      return
    }

    // ✅ ส่ง function ให้ Page (ยังไม่ run)
    onRun(() =>
      runEngineOnTripSummary({
        year,
        month,
      })
    )

    onClose()
  }

  return (
    <BaseRunModal
      open={open}
      title="📊 Run Engine-On Trip Summary"
      onClose={onClose}
      onRun={handleConfirm}
    >
      <div className="space-y-4">
        {/* Year */}
        <div>
          <label className="text-sm font-medium text-gray-700">
            Year
          </label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        {/* Month */}
        <div>
          <label className="text-sm font-medium text-gray-700">
            Month
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      </div>
    </BaseRunModal>
  )
}
