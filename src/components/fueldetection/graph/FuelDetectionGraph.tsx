"use client"

import { useMemo, useState } from "react"
import { FuelChart } from "./FuelChart"
import { ReviewPanel } from "./ReviewPanel"
import { toDateFromThai, overlap } from "@/lib/dt-th"
import type { FuelDetectionData } from "@/lib/types"

/* ---------------------------------------
   Types
--------------------------------------- */
export type ReviewRow = {
  _id: unknown
  plate: string
  start_ts: number
  end_ts: number
  decision: string
  note?: string
  reviewer?: string
  created_at?: string
  fuel_start?: number
  fuel_end?: number
  fuel_diff?: number
}

type Decision =
  | "reviewed_ok"
  | "reviewed_suspicious"
  | "false_positive"
  | "need_follow_up"

interface Props {
  data: FuelDetectionData[]
  reviews: ReviewRow[]
}

type Window = { fromIdx: number; toIdx: number }

/* ---------------------------------------
   Component
--------------------------------------- */
export default function FuelDetectionGraph({
  data,
  reviews,
}: Props) {
  /* ---------- UI state ---------- */
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)
  const [decision, setDecision] =
    useState<Decision>("reviewed_ok")
  const [note, setNote] = useState<string>("")
  const [saving, setSaving] = useState<boolean>(false)

  /* ---------- Chart data prep ---------- */
  const labels = useMemo<string[]>(
    () => data.map(d => `${d.วันที่} ${d.เวลา}`),
    [data]
  )

  const fuelData = useMemo<number[]>(
    () => data.map(d => Number(d.น้ำมัน ?? 0)),
    [data]
  )

  const speedData = useMemo<number[]>(
    () =>
      data.map(d =>
        Number(d["ความเร็ว(กม./ชม.)"] ?? 0)
      ),
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

  /* ---------------------------------------
     Build reviewed / unreviewed windows
  --------------------------------------- */
  const bandWindows = useMemo<{
    reviewed: Window[]
    unreviewed: Window[]
  }>(() => {
    if (!tsData.length)
      return { reviewed: [], unreviewed: [] }

    // true = reviewed, false = unreviewed
    const reviewedFlags: boolean[] = tsData.map(ts =>
      ts == null
        ? false
        : reviews.some(r =>
            overlap(
              ts,
              ts,
              r.start_ts,
              r.end_ts
            )
          )
    )

    const buildWindows = (flags: boolean[]) => {
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
      reviewed: buildWindows(reviewedFlags),
      unreviewed: buildWindows(
        reviewedFlags.map(v => !v)
      ),
    }
  }, [reviews, tsData])

  /* ---------- Range selection ---------- */
  const handleSelectIndex = (idx: number) => {
    if (selStart == null || selEnd != null) {
      setSelStart(idx)
      setSelEnd(null)
    } else {
      setSelEnd(idx)
    }
  }

  /* ---------- Selected summary ---------- */
  const selected = useMemo(() => {
    if (
      selStart == null ||
      selEnd == null ||
      !data[selStart] ||
      !data[selEnd]
    )
      return null

    const a = data[selStart]
    const b = data[selEnd]

    const fuelStart = Number(a.น้ำมัน ?? 0)
    const fuelEnd = Number(b.น้ำมัน ?? 0)

    return {
      plate: a.ทะเบียนพาหนะ,
      startDate: a.วันที่,
      startTime: a.เวลา,
      endDate: b.วันที่,
      endTime: b.เวลา,
      fuelStart,
      fuelEnd,
      fuelDiff: fuelStart - fuelEnd,
      durationMin: Math.abs(selEnd - selStart) * 5,
    }
  }, [selStart, selEnd, data])

  /* ---------- Save review ---------- */
  const saveReview = async () => {
    if (!selected) return

    setSaving(true)
    try {
      const res = await fetch("/api/fuel-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: selected.plate,
          startDate: selected.startDate,
          startTime: selected.startTime,
          endDate: selected.endDate,
          endTime: selected.endTime,
          fuelStart: selected.fuelStart,
          fuelEnd: selected.fuelEnd,
          fuelDiff: selected.fuelDiff,
          durationMin: selected.durationMin,
          decision,
          note,
          reviewer: "ops",
        }),
      })

      if (!res.ok) throw new Error("Save review failed")

      alert("✅ บันทึกผลตรวจเรียบร้อย")

      setSelStart(null)
      setSelEnd(null)
      setDecision("reviewed_ok")
      setNote("")
    } catch (err) {
      console.error(err)
      alert("❌ บันทึกไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  /* ---------- Render ---------- */
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        🔴 Unreviewed | 🔵 Reviewed | คลิก 2 ครั้งเพื่อเลือกช่วง
      </div>

      <FuelChart
        labels={labels}
        fuelData={fuelData}
        speedData={speedData}
        bandWindows={bandWindows}
        onSelectIndex={handleSelectIndex}
      />

      {selected && (
        <ReviewPanel
          selected={selected}
          decision={decision}
          note={note}
          saving={saving}
          onDecisionChange={setDecision}
          onNoteChange={setNote}
          onSave={saveReview}
        />
      )}
    </div>
  )
}
