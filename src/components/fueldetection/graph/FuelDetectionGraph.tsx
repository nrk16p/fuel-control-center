"use client"

import { useMemo, useState, useCallback } from "react"
import { FuelChart, type FocusRange } from "./FuelChart"
import { SuspiciousCaseCard } from "./SuspiciousCaseCard"
import { ReviewPanel } from "./ReviewPanel"
import { DetectedEventsList, type DetectedCase } from "./DetectedEventsList"
import type { OverlayBand, OverlayMarker, OverlayRefuel } from "./fuelOverlayPlugin"
import { toDateFromThai, overlap } from "@/lib/dt-th"
import {
  DEFAULT_DETECT,
  detectFuelEvents,
  smoothFuel,
  type DetectOptions,
  type FuelPoint,
} from "@/lib/fuel-analysis"
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
const DECISION_LABEL: Record<string, string> = {
  reviewed_ok: "ปกติ",
  reviewed_suspicious: "น่าสงสัย",
  false_positive: "แจ้งเตือนผิด",
  need_follow_up: "ต้องติดตาม",
}

// ผลรีวิวที่ถือว่า "ไม่ใช่เคส" → แสดงเป็นสีเทา
const isCleared = (decision: string) => decision === "reviewed_ok" || decision === "false_positive"

const MIN = 60_000

type Row = FuelDetectionData & { ts: number }

/* ---------- Component ---------- */
export default function FuelDetectionGraph({ data, reviews, onReviewSaved }: Props) {
  /* ---------- Selection State ---------- */
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)
  const [focus, setFocus] = useState<FocusRange | null>(null)

  /* ---------- Review Form State ---------- */
  const [decision, setDecision] = useState<Decision>("reviewed_suspicious")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ---------- Detection settings ---------- */
  const [detectOpts, setDetectOpts] = useState<DetectOptions>(DEFAULT_DETECT)

  /* ---------- Data (เฉพาะจุดที่แปลงเวลาได้ เรียงตามเวลา) ---------- */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const d of data) {
      const dt = toDateFromThai(d.วันที่, d.เวลา)
      if (dt) out.push({ ...d, ts: dt.getTime() })
    }
    return out.sort((a, b) => a.ts - b.ts)
  }, [data])

  const points = useMemo<FuelPoint[]>(
    () =>
      rows.map((r) => ({
        ts: r.ts,
        fuel: Number(r.น้ำมัน ?? 0),
        speed: Number(r["ความเร็ว(กม./ชม.)"] ?? 0),
        status: r.สถานะ ?? "",
      })),
    [rows]
  )

  const series = useMemo(
    () => ({
      ts: points.map((p) => p.ts),
      raw: points.map((p) => p.fuel),
      speed: points.map((p) => p.speed),
      status: points.map((p) => p.status),
    }),
    [points]
  )

  const smooth = useMemo(() => smoothFuel(points), [points])

  const events = useMemo(() => detectFuelEvents(points, smooth, detectOpts), [points, smooth, detectOpts])

  /* ---------- Selection → timestamps ---------- */
  const selection = useMemo(() => {
    if (selStart == null) return null
    return { startTs: series.ts[selStart], endTs: selEnd != null ? series.ts[selEnd] : null }
  }, [selStart, selEnd, series.ts])

  /* ---------- Detected cases (+ ผลรีวิวที่ทับช่วง) ---------- */
  const cases = useMemo<DetectedCase[]>(() => {
    return events
      .filter((e) => e.kind !== "refuel")
      .map((e, i) => {
        // API เรียง created_at ล่าสุดก่อน → ตัวแรกที่ทับคือผลล่าสุด
        const review = reviews.find((r) => overlap(e.startTs, e.endTs, r.start_ts, r.end_ts))
        const selected =
          selection != null &&
          overlap(e.startTs, e.endTs, selection.startTs, selection.endTs ?? selection.startTs)
        return {
          ...e,
          n: i + 1,
          reviewLabel: review ? DECISION_LABEL[review.decision] ?? review.decision : null,
          reviewTone: review && isCleared(review.decision) ? "muted" : "clay",
          selected,
        }
      })
  }, [events, reviews, selection])

  /* ---------- Overlay (วาดทับกราฟ) ---------- */
  const overlay = useMemo(() => {
    const bands: OverlayBand[] = [
      ...reviews.map((r) => ({
        startTs: r.start_ts,
        endTs: r.end_ts,
        tone: isCleared(r.decision) ? ("forest" as const) : ("clay" as const),
        strength: 0.08,
      })),
      ...cases
        .filter((c) => c.reviewLabel == null && !c.selected)
        .map((c) => ({ startTs: c.startTs, endTs: c.endTs, tone: "clay" as const, strength: 0.1 })),
    ]
    const markers: OverlayMarker[] = cases.map((c) => ({
      n: c.n,
      ts: (c.startTs + c.endTs) / 2,
      fuel: smooth[c.startIdx],
      tone: c.reviewTone,
      selected: c.selected,
    }))
    const refuels: OverlayRefuel[] = events
      .filter((e) => e.kind === "refuel")
      .map((e) => ({ ts: e.endTs, fuel: smooth[e.endIdx], amount: e.amount }))
    return { bands, markers, refuels, selection }
  }, [reviews, cases, events, smooth, selection])

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

  // ซูมกราฟให้เห็นช่วงนั้นพร้อมบริบทรอบ ๆ
  const focusOn = useCallback((startTs: number, endTs: number) => {
    const pad = Math.max(30 * MIN, endTs - startTs)
    setFocus({ min: startTs - pad, max: endTs + pad, key: Date.now() })
  }, [])

  const selectFromCase = useCallback(
    (c: DetectedCase) => {
      const review = reviews.find((r) => overlap(c.startTs, c.endTs, r.start_ts, r.end_ts))
      setSelStart(c.startIdx)
      setSelEnd(c.endIdx)
      setDecision((review?.decision as Decision) ?? "reviewed_suspicious")
      setNote(review?.note ?? "")
      setError(null)
      focusOn(c.startTs, c.endTs)
    },
    [reviews, focusOn]
  )

  const selectFromReview = useCallback(
    (review: ReviewRow) => {
      let startIdx: number | null = null
      let endIdx: number | null = null

      series.ts.forEach((ts, i) => {
        if (overlap(ts, ts, review.start_ts, review.end_ts)) {
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
        focusOn(review.start_ts, review.end_ts)
      }
    },
    [series.ts, focusOn]
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
    const a = rows[selStart]
    const b = rows[selEnd]
    if (!a || !b) return null

    // ค่าที่บันทึกยังเป็นค่าดิบจากเซนเซอร์ (เหมือนเดิม)
    const fuelStart = Number(a.น้ำมัน ?? 0)
    const fuelEnd = Number(b.น้ำมัน ?? 0)

    return {
      startIdx: selStart,
      endIdx: selEnd,
      plate: a.ทะเบียนพาหนะ,
      startDate: a.วันที่,      // ✅ Thai date string
      startTime: a.เวลา,         // ✅ Time string
      endDate: b.วันที่,          // ✅ Thai date string
      endTime: b.เวลา,            // ✅ Time string
      startTs: a.ts,
      endTs: b.ts,
      fuelStart,
      fuelEnd,
      fuelDiff: fuelStart - fuelEnd,
      durationMin: Math.round((b.ts - a.ts) / 60000),
    }
  }, [selStart, selEnd, rows])

  /* ---------- Suspicious reviews (บันทึกไว้แล้ว) ---------- */
  const suspiciousReviews = useMemo(
    () => reviews.filter((r) => r.decision === "reviewed_suspicious"),
    [reviews]
  )

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
        reviewer: "fuel team",
        
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
        ts={series.ts}
        raw={series.raw}
        smooth={smooth}
        speed={series.speed}
        status={series.status}
        overlay={overlay}
        focus={focus}
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

      {/* จุดที่ระบบตรวจพบ */}
      {rows.length > 0 && (
        <DetectedEventsList
          cases={cases}
          opts={detectOpts}
          onOptsChange={setDetectOpts}
          onSelect={selectFromCase}
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
