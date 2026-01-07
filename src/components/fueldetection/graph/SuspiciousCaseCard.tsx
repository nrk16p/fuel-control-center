"use client"

import { memo } from "react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

const BANGKOK_TZ = "Asia/Bangkok"

interface Props {
  plate: string
  startTs: number
  endTs: number
  fuelDiff?: number
  note?: string
  reviewer?: string
  onSelect: () => void
}

function SuspiciousCaseCardComponent({
  plate,
  startTs,
  endTs,
  fuelDiff,
  note,
  reviewer,
  onSelect,
}: Props) {
  const startDate = dayjs(startTs)
  const endDate = dayjs(endTs)

  const isSameDay = startDate.format("YYYY-MM-DD") === endDate.format("YYYY-MM-DD")

  const formatFuelDiff = (diff: number | undefined) => {
    if (diff == null) return "N/A"
    return Math.abs(diff).toFixed(2)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`รถ ${plate} น้ำมันลดลง ${formatFuelDiff(fuelDiff)} ลิตร`}
      className="group rounded-xl border border-red-200 bg-red-50 p-4 space-y-2 cursor-pointer transition-all hover:border-red-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-red-700 flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            ⚠️
          </span>
          <span>รถ {plate}</span>
        </div>
        <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
          {reviewer ? `ตรวจโดย ${reviewer}` : "ยังไม่ได้ตรวจสอบ"}
        </div>
      </div>

      {/* Time Range */}
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span aria-hidden="true">⏱</span>
        <time dateTime={startDate.toISOString()}>
          {startDate.format("DD MMM YYYY HH:mm")}
        </time>
        <span>→</span>
        <time dateTime={endDate.toISOString()}>
          {isSameDay ? endDate.format("HH:mm") : endDate.format("DD MMM YYYY HH:mm")}
        </time>
      </div>

      {/* Fuel Change */}
      <div className="text-sm">
        <span aria-hidden="true">⛽</span>{" "}
        <span className="font-semibold text-red-700">
          น้ำมันลดลง {formatFuelDiff(fuelDiff)} ลิตร
        </span>
      </div>

      {/* Note */}
      {note && (
        <div className="text-sm text-gray-600 bg-white/50 p-2 rounded border border-red-100">
          <span aria-hidden="true">📝</span> {note}
        </div>
      )}

      {/* Hover indicator */}
      <div className="text-xs text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
        คลิกเพื่อดูรายละเอียดบนกราฟ
      </div>
    </div>
  )
}

export const SuspiciousCaseCard = memo(SuspiciousCaseCardComponent)