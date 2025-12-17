"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { runEngineOn } from "@/lib/etlApi"
import { toDMY } from "@/lib/date"

interface Props {
  open: boolean
  onClose: () => void
  onRun: (run: () => Promise<{ job_id: string }>) => void
}

export default function RunEngineOnModal({
  open,
  onClose,
  onRun,
}: Props) {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const handleConfirm = () => {
    if (!startDate || !endDate) {
      alert("❗ Please select start & end date")
      return
    }

    // ✅ ส่ง function ให้ Page (ยังไม่ run)
    onRun(() =>
      runEngineOn({
        start_date: toDMY(startDate),
        end_date: toDMY(endDate),
        max_distance: 200,
        save_raw: true,
        save_summary: true,
        parallel_dates: false,
        max_workers: 4,
      })
    )

    onClose()
  }

  return (
    <BaseRunModal
      open={open}
      title="🔥 Run Engine-On ETL"
      onClose={onClose}
      onRun={handleConfirm}
    >
      <div className="space-y-3">
        <div>
          <label className="text-sm text-gray-600">Start Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm text-gray-600">End Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
    </BaseRunModal>
  )
}
