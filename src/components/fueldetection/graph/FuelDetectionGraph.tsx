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

  const tsData = useMemo<(number | null)[]>(
    () =>
      data.map(d => {
        const dt = toDateFromThai(d.วันที่, d.เวลา)
        return dt ? dt.getTime() : null
      }),
    [data]
  )

  const reviewIndexWindows = useMemo(() => {
    if (!reviews?.length) return []

    const flags: (number | null)[] = tsData.map((ts, i) =>
      reviews.some((r: any) =>
        overlap(ts, ts, r.start_ts, r.end_ts)
      )
        ? i
        : null
    )

    const windows: { fromIdx: number; toIdx: number }[] = []

    for (let i = 0; i < flags.length; i++) {
      if (flags[i] == null) continue
      let j = i
      while (flags[j + 1] != null) j++
      windows.push({ fromIdx: i, toIdx: j })
      i = j
    }

    return windows
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
