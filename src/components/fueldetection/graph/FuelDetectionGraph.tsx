"use client"

import { useMemo, useState } from "react"
import { FuelChart } from "./FuelChart"
import { SuspiciousCaseCard } from "./SuspiciousCaseCard"
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

  /* ---------- suspicious windows ---------- */
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

  /* ---------- Render ---------- */
  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-600">
        ⚪ Unreviewed | 🔵 Reviewed | 🔴 ลดลงผิดปกติ
      </div>

      {/* Chart */}
      <FuelChart
        labels={labels}
        fuelData={fuelData}
        speedData={speedData}
        bandWindows={bandWindows}
        suspiciousWindows={suspiciousWindows}
        onSelectIndex={() => {}}
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
          />
        ))}

        {suspiciousReviews.length === 0 && (
          <div className="text-sm text-gray-500">
            ไม่มีเคสลดลงผิดปกติในช่วงเวลาที่เลือก
          </div>
        )}
      </div>
    </div>
  )
}
