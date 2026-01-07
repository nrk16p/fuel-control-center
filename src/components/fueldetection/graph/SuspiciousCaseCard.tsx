"use client"

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
dayjs.extend(utc)

interface Props {
  plate: string
  startTs: number
  endTs: number
  fuelDiff?: number
  note?: string
  reviewer?: string
  onSelect: () => void   // ✅ เพิ่ม
}

export function SuspiciousCaseCard({
  plate,
  startTs,
  endTs,
  fuelDiff,
  note,
  reviewer,
  onSelect,
}: Props) {
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-1 cursor-pointer hover:ring-2 hover:ring-red-300"
      onClick={onSelect}
    >
      <div className="font-semibold text-red-700">
        ⚠️ รถ {plate}
      </div>

      <div className="text-sm text-gray-700">
        ⏱ {dayjs(startTs).format("DD MMM YYYY HH:mm")} →{" "}
        {dayjs(endTs).format("HH:mm")}
      </div>

      <div className="text-sm">
        ⛽ ลดลง{" "}
        <span className="font-semibold text-red-700">
          {fuelDiff?.toFixed(2) ?? "-"} ลิตร
        </span>
      </div>

      {note && <div className="text-sm">📝 {note}</div>}
      {reviewer && (
        <div className="text-xs text-gray-500">
          Reviewed by {reviewer}
        </div>
      )}
    </div>
  )
}
