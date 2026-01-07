"use client"

import { useMemo, useState, useCallback } from "react"
import { FuelChart } from "./FuelChart"
import { SuspiciousCaseCard } from "./SuspiciousCaseCard"
import { ReviewPanel } from "./ReviewPanel"
import { toDateFromThai, overlap } from "@/lib/dt-th"
import type { FuelDetectionData } from "@/lib/types"

/* ---------- Types ---------- */
export type ReviewRow = {
  _id: string
  plate: string
  start_ts: number
  end_ts: number
  decision: string  // ✅ Allow any string from DB
  note?: string
  reviewer?: string
  fuel_diff?: number
}

export type Decision =
  | "reviewed_ok"
  | "reviewed_suspicious"
  | "false_positive"
  | "need_follow_up"

type Window = { fromIdx: number; toIdx: number }

interface Props {
  data: FuelDetectionData[]
  reviews: ReviewRow[]
  onReviewSaved?: () => void
}

interface SelectedRange {
  startIdx: number
  endIdx: number
  plate: string
  startDate: string  // Thai date format from data
  startTime: string  // Time string from data
  endDate: string    // Thai date format from data
  endTime: string    // Time string from data
  startTs: number
  endTs: number
  fuelStart: number
  fuelEnd: number
  fuelDiff: number
  durationMin: number
}

/* ---------- Helpers ---------- */
const buildWindows = (flags: boolean[]): Window[] => {
  const windows: Window[] = []
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue
    let j = i
    while (j + 1 < flags.length && flags[j + 1]) j++
    windows.push({ fromIdx: i, toIdx: j })
    i = j
  }
  return windows
}

/* ---------- Component ---------- */
export default function FuelDetectionGraph({ data, reviews, onReviewSaved }: Props) {
  /* ---------- Selection State ---------- */
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)

  /* ---------- Review Form State ---------- */
  const [decision, setDecision] = useState<Decision>("reviewed_suspicious")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ---------- Memoized Data Transformations ---------- */
  const labels = useMemo(() => data.map((d) => `${d.วันที่} ${d.เวลา}`), [data])

  const fuelData = useMemo(() => data.map((d) => Number(d.น้ำมัน ?? 0)), [data])

  const speedData = useMemo(
    () => data.map((d) => Number(d["ความเร็ว(กม./ชม.)"] ?? 0)),
    [data]
  )

  const tsData = useMemo<(number | null)[]>(
    () =>
      data.map((d) => {
        const dt = toDateFromThai(d.วันที่, d.เวลา)
        return dt ? dt.getTime() : null
      }),
    [data]
  )

  /* ---------- Reviewed/Unreviewed Bands ---------- */
  const bandWindows = useMemo(() => {
    const reviewedFlags = tsData.map((ts) =>
      ts == null ? false : reviews.some((r) => overlap(ts, ts, r.start_ts, r.end_ts))
    )

    return {
      reviewed: buildWindows(reviewedFlags),
      unreviewed: buildWindows(reviewedFlags.map((v) => !v)),
    }
  }, [reviews, tsData])

  /* ---------- Suspicious Cases ---------- */
  const suspiciousReviews = useMemo(
    () => reviews.filter((r) => r.decision === "reviewed_suspicious"),
    [reviews]
  )

  const suspiciousWindows = useMemo<Window[]>(() => {
    const flags = tsData.map((ts) =>
      ts == null
        ? false
        : suspiciousReviews.some((r) => overlap(ts, ts, r.start_ts, r.end_ts))
    )
    return buildWindows(flags)
  }, [suspiciousReviews, tsData])

  /* ---------- Selection Handlers ---------- */
  const handleSelectIndex = useCallback(
    (idx: number) => {
      if (selStart == null || selEnd != null) {
        setSelStart(idx)
        setSelEnd(null)
        setError(null)
      } else {
        const start = Math.min(selStart, idx)
        const end = Math.max(selStart, idx)
        setSelStart(start)
        setSelEnd(end)
      }
    },
    [selStart, selEnd]
  )

  const selectFromReview = useCallback(
    (review: ReviewRow) => {
      let startIdx: number | null = null
      let endIdx: number | null = null

      tsData.forEach((ts, i) => {
        if (ts != null && overlap(ts, ts, review.start_ts, review.end_ts)) {
          if (startIdx == null) startIdx = i
          endIdx = i
        }
      })

      if (startIdx != null && endIdx != null) {
        setSelStart(startIdx)
        setSelEnd(endIdx)
        // Cast to Decision type (DB value should match one of the allowed values)
        setDecision(review.decision as Decision)
        setNote(review.note ?? "")
        setError(null)
      }
    },
    [tsData]
  )

  const clearSelection = useCallback(() => {
    setSelStart(null)
    setSelEnd(null)
    setNote("")
    setError(null)
  }, [])

  /* ---------- Selected Range Data ---------- */
  const selectedRange = useMemo<SelectedRange | null>(() => {
    if (selStart == null || selEnd == null) return null

    const startTs = tsData[selStart]
    const endTs = tsData[selEnd]

    if (startTs == null || endTs == null) return null

    const fuelStart = Number(data[selStart].น้ำมัน ?? 0)
    const fuelEnd = Number(data[selEnd].น้ำมัน ?? 0)

    return {
      startIdx: selStart,
      endIdx: selEnd,
      plate: data[selStart].ทะเบียนพาหนะ,
      startDate: data[selStart].วันที่,      // ✅ Thai date string
      startTime: data[selStart].เวลา,         // ✅ Time string
      endDate: data[selEnd].วันที่,          // ✅ Thai date string
      endTime: data[selEnd].เวลา,            // ✅ Time string
      startTs,
      endTs,
      fuelStart,
      fuelEnd,
      fuelDiff: fuelStart - fuelEnd,
      durationMin: Math.round((endTs - startTs) / 60000),
    }
  }, [selStart, selEnd, tsData, data])

  /* ---------- Save Review ---------- */
  const saveReview = useCallback(async () => {
    if (!selectedRange) return

    // Validation
    if (!note.trim() && decision === "reviewed_suspicious") {
      setError("กรุณาใส่หมายเหตุสำหรับกรณีที่น้ำมันลดลงผิดปกติ")
      return
    }

    setSaving(true)
    setError(null)

    try {
      // ✅ Match API expectations (mixed case!)
      const payload = {
        plate: selectedRange.plate,
        
        // Timestamps: snake_case (API reads body.start_ts)
        start_ts: selectedRange.startTs,
        end_ts: selectedRange.endTs,
        
        // Display strings: camelCase (optional)
        startDate: selectedRange.startDate,
        startTime: selectedRange.startTime,
        endDate: selectedRange.endDate,
        endTime: selectedRange.endTime,
        
        // Fuel: camelCase (API reads body.fuelStart)
        fuelStart: selectedRange.fuelStart,
        fuelEnd: selectedRange.fuelEnd,
        fuelDiff: selectedRange.fuelDiff,
        durationMin: selectedRange.durationMin,
        
        decision,
        note: note.trim(),
        reviewer: "ีทีมเชื้อเพลิง",
        
        // Revision: camelCase (API reads body.revisionOf)
        revisionOf: null,
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.log("🚀 SENDING TO API:")
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.log(JSON.stringify(payload, null, 2))
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

      const response = await fetch("/api/fuel-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      console.log("📡 Response Status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.log("📡 Response Body:", errorText)
        
        let errorData: any = {}
        try {
          errorData = JSON.parse(errorText)
        } catch (e) {
          // Not JSON
        }
        
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        console.log("❌ API ERROR:")
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        console.log("Status:", response.status)
        console.log("Error:", errorData.error || errorText)
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        throw new Error(errorData.error || errorText || `HTTP ${response.status}`)
      }

      const result = await response.json()
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.log("✅ SAVE SUCCESSFUL!")
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.log(result)
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

      // Success
      clearSelection()
      onReviewSaved?.()
    } catch (err) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.log("💥 ERROR CAUGHT:")
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.error(err)
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setSaving(false)
    }
  }, [selectedRange, decision, note, clearSelection, onReviewSaved])

  /* ---------- Render ---------- */
  return (
    <div className="space-y-6">
      {/* Chart */}
      <FuelChart
        labels={labels}
        fuelData={fuelData}
        speedData={speedData}
        bandWindows={bandWindows}
        suspiciousWindows={suspiciousWindows}
        onSelectIndex={handleSelectIndex}
      />

      {/* Review Panel */}
      {selectedRange && (
        <ReviewPanel
          selected={selectedRange}
          decision={decision}
          note={note}
          saving={saving}
          error={error}
          onDecisionChange={setDecision}
          onNoteChange={setNote}
          onSave={saveReview}
          onCancel={clearSelection}
        />
      )}

      {/* Suspicious Cases */}
      {suspiciousReviews.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">
            กรณีน้ำมันลดลงผิดปกติ ({suspiciousReviews.length})
          </h3>
          {suspiciousReviews.map((review) => (
            <SuspiciousCaseCard
              key={review._id}
              plate={review.plate}
              startTs={review.start_ts}
              endTs={review.end_ts}
              fuelDiff={review.fuel_diff}
              note={review.note}
              reviewer={review.reviewer}
              onSelect={() => selectFromReview(review)}
            />
          ))}
        </div>
      )}
    </div>
  )
}