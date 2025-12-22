"use client"

import { useMemo, useState } from "react"
import { FuelChart } from "./FuelChart"
import { ReviewPanel } from "./ReviewPanel"
import { toDateFromThai, overlap } from "@/lib/dt-th"

export default function FuelDetectionGraph({ data, reviews }: any) {
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)
  const [decision, setDecision] = useState("reviewed_ok")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const labels = useMemo(
    () => data.map((d: any) => `${d.วันที่} ${d.เวลา}`),
    [data]
  )
  const fuelData = useMemo(() => data.map((d: any) => d.น้ำมัน ?? 0), [data])
  const speedData = useMemo(
    () => data.map((d: any) => d["ความเร็ว(กม./ชม.)"] ?? 0),
    [data]
  )

  const tsData = useMemo(
    () => data.map((d: any) => toDateFromThai(d.วันที่, d.เวลา)?.getTime()),
    [data]
  )

  const reviewIndexWindows = useMemo(() => {
    if (!reviews?.length) return []
    return tsData
      .map((ts: number, i: number) =>
        reviews.some((r: any) => overlap(ts, ts, r.start_ts, r.end_ts))
          ? i
          : null
      )
      .reduce((acc: any[], v, i, arr) => {
        if (v == null || arr[i - 1] != null) return acc
        let j = i
        while (arr[j + 1] != null) j++
        acc.push({ fromIdx: i, toIdx: j })
        return acc
      }, [])
  }, [reviews, tsData])

  const handleSelect = (idx: number) => {
    if (selStart == null || selEnd != null) {
      setSelStart(idx)
      setSelEnd(null)
    } else setSelEnd(idx)
  }

  const selected =
    selStart != null && selEnd != null
      ? { plate: data[selStart].ทะเบียนพาหนะ }
      : null

  return (
    <div className="space-y-4">
      <FuelChart
        labels={labels}
        fuelData={fuelData}
        speedData={speedData}
        reviewIndexWindows={reviewIndexWindows}
        onSelectIndex={handleSelect}
      />

      {selected && (
        <ReviewPanel
          selected={selected}
          decision={decision as any}
          note={note}
          saving={saving}
          onDecisionChange={setDecision as any}
          onNoteChange={setNote}
          onSave={() => {}}
        />
      )}
    </div>
  )
}
