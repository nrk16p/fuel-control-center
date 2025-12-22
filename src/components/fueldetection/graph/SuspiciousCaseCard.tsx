"use client"

import dayjs from "dayjs"
import "dayjs/locale/th"

dayjs.locale("th")

interface Props {
  plate: string
  startTs: number
  endTs: number
  fuelDiff?: number
  note?: string
  reviewer?: string
}

export function SuspiciousCaseCard({
  plate,
  startTs,
  endTs,
  fuelDiff,
  note,
  reviewer,
}: Props) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-1">
      <div className="font-semibold text-red-700 flex items-center gap-2">
        ⚠️ รถ {plate}
      </div>

      <div className="text-sm text-gray-700">
        ⏱ {dayjs(startTs).format("DD MMM YYYY HH:mm")} →{" "}
        {dayjs(endTs).format("HH:mm")}
      </div>

      <div className="text-sm">
        ⛽ ลดลง{" "}
        <span className="font-semibold text-red-700">
          {fuelDiff ?? "-"} ลิตร
        </span>
      </div>

      {note && (
        <div className="text-sm text-gray-600">
          📝 {note}
        </div>
      )}

      {reviewer && (
        <div className="text-xs text-gray-500">
          Reviewed by: {reviewer}
        </div>
      )}
    </div>
  )
}
