"use client"

import { useMemo, useState } from "react"
import {
  Chart as ChartJS,
  registerables,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"
import { toDateFromThai, overlap } from "@/lib/dt-th"

/* --------------------------------------------------
   Register Chart.js
-------------------------------------------------- */
ChartJS.register(...registerables, zoomPlugin)

/* --------------------------------------------------
   Types
-------------------------------------------------- */
export interface FuelDetectionData {
  _id: string
  วันที่: string
  เวลา: string
  ทะเบียนพาหนะ: string
  น้ำมัน: number
  "ความเร็ว(กม./ชม.)": number
}

export type ReviewRow = {
  _id: any
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
  revision_of?: any
}

type Decision =
  | "reviewed_ok"
  | "reviewed_suspicious"
  | "false_positive"
  | "need_follow_up"

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */
function toTs(d: FuelDetectionData): number | null {
  const dt = toDateFromThai(d.วันที่, d.เวลา)
  return dt ? dt.getTime() : null
}

function clampRange(a: number, b: number) {
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

/* --------------------------------------------------
   Plugin: Reviewed window overlay
-------------------------------------------------- */
const reviewedBandsPlugin = {
  id: "reviewedBands",
  beforeDraw(chart: any, _args: any, opts: any) {
    const windows: Array<{ fromIdx: number; toIdx: number }> =
      opts?.windows || []
    if (!windows.length) return

    const { ctx, chartArea, scales } = chart
    const x = scales.x
    if (!x) return

    ctx.save()
    ctx.fillStyle = "rgba(59,130,246,0.08)" // light blue
    for (const w of windows) {
      const x1 = x.getPixelForValue(w.fromIdx)
      const x2 = x.getPixelForValue(w.toIdx)
      const left = Math.max(chartArea.left, Math.min(x1, x2))
      const right = Math.min(chartArea.right, Math.max(x1, x2))
      ctx.fillRect(
        left,
        chartArea.top,
        right - left,
        chartArea.bottom - chartArea.top
      )
    }
    ctx.restore()
  },
}

ChartJS.register(reviewedBandsPlugin as any)

/* --------------------------------------------------
   Component
-------------------------------------------------- */
export default function FuelDetectionGraph({
  data,
  reviews,
}: {
  data: FuelDetectionData[]
  reviews: ReviewRow[]
}) {
  const [selStartIdx, setSelStartIdx] = useState<number | null>(null)
  const [selEndIdx, setSelEndIdx] = useState<number | null>(null)
  const [decision, setDecision] = useState<Decision>("reviewed_ok")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  /* ---------------- Data prep ---------------- */
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

  const tsData = useMemo(() => data.map(d => toTs(d)), [data])

  /* ---------------- Reviewed index windows ---------------- */
  const reviewIndexWindows = useMemo(() => {
    if (!data.length || !reviews.length) return []

    const inside = tsData.map(ts => {
      if (ts == null) return false
      return reviews.some(r =>
        overlap(ts, ts, Number(r.start_ts), Number(r.end_ts))
      )
    })

    const windows: Array<{ fromIdx: number; toIdx: number }> = []
    let i = 0
    while (i < inside.length) {
      if (!inside[i]) {
        i++
        continue
      }
      let j = i
      while (j + 1 < inside.length && inside[j + 1]) j++
      windows.push({ fromIdx: i, toIdx: j })
      i = j + 1
    }
    return windows
  }, [data, reviews, tsData])

  /* ---------------- Selection ---------------- */
  const selected = useMemo(() => {
    if (selStartIdx == null || selEndIdx == null) return null
    const { start, end } = clampRange(selStartIdx, selEndIdx)
    const a = data[start]
    const b = data[end]
    if (!a || !b) return null

    const fuelStart = Number(a.น้ำมัน ?? 0)
    const fuelEnd = Number(b.น้ำมัน ?? 0)
    const fuelDiff = fuelStart - fuelEnd
    const durationMin = (end - start) * 5

    const startTs = tsData[start]
    const endTs = tsData[end]

    const overlapped =
      startTs != null && endTs != null
        ? reviews.filter(r =>
            overlap(
              Number(r.start_ts),
              Number(r.end_ts),
              startTs,
              endTs
            )
          )
        : []

    return {
      startIdx: start,
      endIdx: end,
      plate: a.ทะเบียนพาหนะ,
      startDate: a.วันที่,
      startTime: a.เวลา,
      endDate: b.วันที่,
      endTime: b.เวลา,
      fuelStart,
      fuelEnd,
      fuelDiff,
      durationMin,
      overlapped,
    }
  }, [selStartIdx, selEndIdx, data, reviews, tsData])

  /* ---------------- Chart Data ---------------- */
  const chartData: ChartData<"bar" | "line", number[], string> = {
    labels,
    datasets: [
      {
        type: "line",
        label: "ระดับน้ำมัน (ลิตร)",
        data: fuelData,
        yAxisID: "y",
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 0,
        order: 1,
      },
      {
        type: "bar",
        label: "ความเร็ว (กม./ชม.)",
        data: speedData,
        yAxisID: "y1",
        borderWidth: 0,
        order: 2,
      },
    ],
  }

  /* ---------------- Options ---------------- */
  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    onClick: (_evt, elements) => {
      const idx = elements?.[0]?.index
      if (idx == null) return
      if (selStartIdx == null || selEndIdx != null) {
        setSelStartIdx(idx)
        setSelEndIdx(null)
      } else {
        setSelEndIdx(idx)
      }
    },
    plugins: {
      legend: { position: "top" },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: (ctx: TooltipItem<"bar" | "line">) => {
            const v = ctx.parsed.y
            if (ctx.dataset.label?.includes("น้ำมัน")) {
              return `⛽ น้ำมัน: ${v} ลิตร`
            }
            return `🚗 ความเร็ว: ${v} กม./ชม.`
          },
        },
      },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x",
        },
        pan: { enabled: true, mode: "x" },
      },
      reviewedBands: {
        windows: reviewIndexWindows,
      } as any,
    } as any,
    scales: {
      x: {
        ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 },
      },
      y: {
        min: 0,
        title: { display: true, text: "ระดับน้ำมัน (ลิตร)" },
      },
      y1: {
        position: "right",
        min: 0,
        grid: { drawOnChartArea: false },
        title: { display: true, text: "ความเร็ว (กม./ชม.)" },
      },
    },
  }

  /* ---------------- Save Review ---------------- */
  async function saveReview(revisionOf?: any) {
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
          revisionOf: revisionOf ?? null,
        }),
      })
      if (!res.ok) throw new Error("Save review failed")
      alert("✅ Saved review")
      setSelStartIdx(null)
      setSelEndIdx(null)
      setDecision("reviewed_ok")
      setNote("")
    } catch (e: any) {
      alert(`❌ ${e.message || "Save failed"}`)
    } finally {
      setSaving(false)
    }
  }

  /* ---------------- Render ---------------- */
  return (
    <div className="w-full space-y-4">
      <div className="text-sm text-gray-600">
        🔵 พื้นหลังฟ้า = Reviewed | ⚪ = Unreviewed | คลิก 2 ครั้งเพื่อเลือกช่วง
      </div>

      <div className="h-[520px] rounded-xl border bg-white p-4 shadow-sm">
        <Chart type="bar" data={chartData} options={options} />
      </div>

      {selected && (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="font-semibold">
            🚚 {selected.plate} | {selected.startDate} {selected.startTime} →{" "}
            {selected.endDate} {selected.endTime}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border rounded p-2">Start: {selected.fuelStart}</div>
            <div className="border rounded p-2">End: {selected.fuelEnd}</div>
            <div className="border rounded p-2">Diff: {selected.fuelDiff}</div>
            <div className="border rounded p-2">
              Duration: {selected.durationMin} min
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <select
              className="border rounded p-2"
              value={decision}
              onChange={e => setDecision(e.target.value as Decision)}
            >
              <option value="reviewed_ok">Reviewed OK</option>
              <option value="reviewed_suspicious">Suspicious</option>
              <option value="false_positive">False Positive</option>
              <option value="need_follow_up">Need Follow-up</option>
            </select>

            <input
              className="border rounded p-2 md:col-span-2"
              placeholder="Note"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <button
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            onClick={() =>
              saveReview(
                selected.overlapped?.[0]?._id ?? null
              )
            }
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Review"}
          </button>
        </div>
      )}
    </div>
  )
}
