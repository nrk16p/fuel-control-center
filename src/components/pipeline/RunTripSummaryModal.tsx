"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { runEngineOnTripSummary } from "@/lib/etlApi"

interface Props {
  open: boolean
  onClose: () => void
  onQueue: (run: () => Promise<{ job_id?: string }>) => void
}

export default function RunTripSummaryModal({ open, onClose, onQueue }: Props) {
  const [year, setYear] = useState(2025)
  const [month, setMonth] = useState(12)

  const handleQueue = () => {
    onQueue(() => runEngineOnTripSummary({ year, month }))
    onClose()
  }

  return (
    <BaseRunModal
      open={open}
      title="📊 Run Engine-On Trip Summary"
      onClose={onClose}
      onRun={handleQueue}
      loading={false}
    >
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Month</label>
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
