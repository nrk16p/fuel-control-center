"use client"

import { useMemo, useState } from "react"
import { FuelChart } from "./FuelChart"
import { ReviewPanel } from "./ReviewPanel"
import { toDateFromThai, overlap } from "@/lib/dt-th"
import type { FuelDetectionData } from "@/lib/types"

/* ---------- Types ---------- */
export type ReviewRow = {
  _id: unknown
  plate: string
  start_ts: number
  end_ts: number
  decision: string
  note?: string
}

type Window = { fromIdx: number; toIdx: number }

interface Props {
  data: FuelDetectionData[]
  reviews: ReviewRow[]
}

/* ---------- Component ---------- */
export default function FuelDetectionGraph({
  data,
  reviews,
}: Props) {
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)

  const labels = useMemo(
    () => data.map(d => `${d.วันที่} ${d.เวลา}`),
    [data]
  )
  const fuelData = useMemo(
    () => data.map(d => Number(d.น้ำมัน ?? 0)),
    [data]
  )
  const speedData = useMemo(
    () => data.map(d => Number(d["ความเร็ว(กม./ชม.)"] ?? 0)),
    [data]
  )

  const tsData = useMemo(
    () =>
      data.map(d => {
        const dt = toDateFromThai(d.วันที่, d.เวลา)
        return dt ? dt.getTime() : null
      }),
    [data]
  )

  /* ---------- reviewed / unreviewed ---------- */
  const bandWindows = useMemo(() => {
    const reviewedFlags = tsData.map(ts =>
      ts == null
        ? false
        : reviews.some(r =>
            overlap(ts, ts, r.start_ts, r.end_ts)
          )
    )

    const build = (flags: boolean[]) => {
      const out: Window[] = []
      for (let i = 0; i < flags.length; i++) {
        if (!flags[i]) continue
        let j = i
        while (flags[j + 1]) j++
        out.push({ fromIdx: i, toIdx: j })
        i = j
      }
      return out
    }

    return {
      reviewed: build(reviewedFlags),
      unreviewed: build(reviewedFlags.map(v => !v)),
    }
  }, [reviews, tsData])

  /* ---------- suspicious highlight ---------- */
  const suspiciousWindows = useMemo<Window[]>(() => {
    const suspicious = reviews.filter(
      r => r.decision === "reviewed_suspicious"
    )

    if (!suspicious.length) return []

    const flags = tsData.map(ts =>
      ts == null
        ? false
        : suspicious.some(r =>
            overlap(ts, ts, r.start_ts, r.end_ts)
          )
    )

    const out: Window[] = []
    for (let i = 0; i < flags.length; i++) {
      if (!flags[i]) continue
      let j = i
      while (flags[j + 1]) j++
      out.push({ fromIdx: i, toIdx: j })
      i = j
    }
    return out
  }, [reviews, tsData])

  const handleSelectIndex = (idx: number) => {
    if (selStart == null || selEnd != null) {
      setSelStart(idx)
      setSelEnd(null)
    } else {
      setSelEnd(idx)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        ⚪ Unreviewed | 🔵 Reviewed | 🔴 ลดลงผิดปกติ
      </div>

      <FuelChart
        labels={labels}
        fuelData={fuelData}
        speedData={speedData}
        bandWindows={bandWindows}
        suspiciousWindows={suspiciousWindows}
        onSelectIndex={handleSelectIndex}
      />

      {/* ReviewPanel เดิมยังใช้ได้ ถ้าต้องการ */}
      {selStart != null && selEnd != null && (
        <ReviewPanel
          selected={{}}
          decision="reviewed_suspicious"
          note=""
          saving={false}
          onDecisionChange={() => {}}
          onNoteChange={() => {}}
          onSave={() => {}}
        />
      )}
    </div>
  )
}
