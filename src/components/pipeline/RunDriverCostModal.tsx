"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { runDriverCost } from "@/lib/etlApi"

interface Props {
  open: boolean
  onClose: () => void
  onRun: (run: () => Promise<{ job_id: string }>) => void
}

export default function RunDriverCostModal({
  open,
  onClose,
  onRun,
}: Props) {
  const [year, setYear] = useState("2025")
  const [month, setMonth] = useState("12")

  const handleConfirm = () => {
    if (!year || !month) {
      alert("❗ Please select year and month")
      return
    }

    // ✅ ส่ง function ให้ Page (ยังไม่ run)
    onRun(() =>
      runDriverCost({
        year,
        month,
      })
    )

    onClose()
  }

  return (
    <BaseRunModal
      open={open}
      title="💰 Driver Cost ETL"
      onClose={onClose}
      onRun={handleConfirm}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">
            Year
          </label>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">
            Month
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          >
            {Array.from({ length: 12 }).map((_, i) => {
              const m = String(i + 1).padStart(2, "0")
              return (
                <option key={m} value={m}>
                  {i + 1}
                </option>
              )
            })}
          </select>
        </div>
      </div>
    </BaseRunModal>
  )
}
