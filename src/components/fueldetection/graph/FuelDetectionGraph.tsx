"use client"

import { useMemo, useState } from "react"
import { FuelChart } from "./FuelChart"
import { SuspiciousCaseCard } from "./SuspiciousCaseCard"
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
  reviewer?: string
  fuel_diff?: number
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
  /* ---------- selection state ---------- */
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)

  /* ---------- Data prep ---------- */
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

  const tsData = useMemo<(number | null)[]>(
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

  /* ---------- suspicious ---------- */
  const suspiciousReviews = useMemo(
    () => reviews.filter(r => r.decision === "reviewed_suspicious"),
    [reviews]
  )

  const suspiciousWindows = useMemo<Window[]>(() => {
    if (!suspiciousReviews.length) return []

    const flags = tsData.map(ts =>
      ts == null
        ? false
        : suspiciousReviews.some(r =>
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
  }, [suspiciousReviews, tsData])

  /* ---------- select from chart ---------- */
  const handleSelectIndex = (idx: number) => {
    if (selStart == null || selEnd != null) {
      setSelStart(idx)
      setSelEnd(null)
    } else {
      setSelEnd(idx)
    }
  }

  /* ---------- select from card ---------- */
  const selectFromReview = (r: ReviewRow) => {
    let start: number | null = null
    let end: number | null = null

    tsData.forEach((ts, i) => {
      if (ts != null && overlap(ts, ts, r.start_ts, r.end_ts)) {
        if (start == null) start = i
        end = i
      }
    })

    if (start != null && end != null) {
      setSelStart(start)
      setSelEnd(end)
    }
  }

  /* ---------- selected summary ---------- */
  const selected =
    selStart != null && selEnd != null
      ? {
          plate: data[selStart].ทะเบียนพาหนะ,
          startDate: data[selStart].วันที่,
          startTime: data[selStart].เวลา,
          endDate: data[selEnd].วันที่,
          endTime: data[selEnd].เวลา,
          fuelStart: data[selStart].น้ำมัน,
          fuelEnd: data[selEnd].น้ำมัน,
          fuelDiff:
            Number(data[selStart].น้ำมัน ?? 0) -
            Number(data[selEnd].น้ำมัน ?? 0),
          durationMin: Math.abs(selEnd - selStart) * 5,
        }
      : null

  /* ---------- Render ---------- */
  return (
    <div className="space-y-6">
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

      {/* Suspicious Cards */}
      <div className="space-y-3">
        <div className="font-semibold text-red-700">
          ⚠️ Suspicious cases ({suspiciousReviews.length})
        </div>

        {suspiciousReviews.map(r => (
          <SuspiciousCaseCard
            key={String(r._id)}
            plate={r.plate}
            startTs={r.start_ts}
            endTs={r.end_ts}
            fuelDiff={r.fuel_diff}
            note={r.note}
            reviewer={r.reviewer}
            onSelect={() => selectFromReview(r)} // ✅ สำคัญ
          />
        ))}
      </div>

      {/* Review Panel */}
      {selected && (
        <ReviewPanel
          selected={selected}
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
