"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { runEngineOn } from "@/lib/etlApi"
import { toDMY } from "@/lib/date"

interface Props {
  open: boolean
  onClose: () => void
  onQueue: (run: () => Promise<{ job_id?: string }>) => void
}

export default function RunEngineOnModal({ open, onClose, onQueue }: Props) {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const handleQueue = () => {
    if (!startDate || !endDate) {
      alert("❗ Please select start & end date")
      return
    }

    // ✅ modal สร้าง run fn แล้วส่งให้ page enqueue
    onQueue(() =>
      runEngineOn({
        start_date: toDMY(startDate), // ✅ dd/mm/yyyy
        end_date: toDMY(endDate),     // ✅ dd/mm/yyyy
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
      loading={false}
      onClose={onClose}
      onRun={handleQueue}
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
