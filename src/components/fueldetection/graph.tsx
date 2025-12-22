"use client"

import { useMemo, useState } from "react"
import {
  Chart as ChartJS,
  registerables,
  type ChartData,
  type ChartOptions,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"
import { toDateFromThai, overlap } from "@/lib/dt-th"

ChartJS.register(...registerables, zoomPlugin)

export interface FuelDetectionData {
  _id: string
  วันที่: string
  เวลา: string
  ทะเบียนพาหนะ: string
  น้ำมัน: number
  "ความเร็ว(กม./ชม.)": number
}

type ReviewRow = {
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

type Decision = "reviewed_ok" | "reviewed_suspicious" | "false_positive" | "need_follow_up"

function toTs(d: FuelDetectionData) {
  const dt = toDateFromThai(d.วันที่, d.เวลา)
  return dt ? dt.getTime() : null
}

function clampRange(a: number, b: number) {
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  return { start, end }
}

// ✅ Chart plugin to paint reviewed windows (background bands)
const reviewedBandsPlugin = {
  id: "reviewedBands",
  beforeDraw(chart: any, _args: any, opts: any) {
    const windows: Array<{ fromIdx: number; toIdx: number }> = opts?.windows || []
    if (!windows.length) return

    const { ctx, chartArea, scales } = chart
    const x = scales.x
    if (!x) return

    ctx.save()
    // light blue overlay
    ctx.fillStyle = "rgba(59,130,246,0.08)"
    for (const w of windows) {
      const x1 = x.getPixelForValue(w.fromIdx)
      const x2 = x.getPixelForValue(w.toIdx)
      const left = Math.max(chartArea.left, Math.min(x1, x2))
      const right = Math.min(chartArea.right, Math.max(x1, x2))
      ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top)
    }
    ctx.restore()
  },
}

ChartJS.register(reviewedBandsPlugin as any)

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

  const labels = useMemo(() => data.map(d => `${d.วันที่} ${d.เวลา}`), [data])
  const fuelData = useMemo(() => data.map(d => Number(d.น้ำมัน ?? 0)), [data])
  const speedData = useMemo(() => data.map(d => Number(d["ความเร็ว(กม./ชม.)"] ?? 0)), [data])
  const tsData = useMemo(() => data.map(d => toTs(d)), [data])

  // ✅ compute reviewed windows -> index ranges to paint
  const reviewIndexWindows = useMemo(() => {
    if (!data.length || !reviews.length) return []
    // mark indices that are inside any review window
    const inside = tsData.map(ts => {
      if (ts == null) return false
      for (const r of reviews) {
        if (overlap(ts, ts, Number(r.start_ts), Number(r.end_ts))) return true
      }
      return false
    })

    // convert boolean array -> contiguous segments
    const windows: Array<{ fromIdx: number; toIdx: number }> = []
    let i = 0
    while (i < inside.length) {
      if (!inside[i]) { i++; continue }
      let j = i
      while (j + 1 < inside.length && inside[j + 1]) j++
      windows.push({ fromIdx: i, toIdx: j })
      i = j + 1
    }
    return windows
  }, [data, reviews, tsData])

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

    const startTs = tsData[start] ?? null
    const endTs = tsData[end] ?? null

    // find overlapped reviews (if any)
    const overlapped = (startTs != null && endTs != null)
      ? reviews.filter(r => overlap(Number(r.start_ts), Number(r.end_ts), startTs, endTs))
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
      startTs,
      endTs,
    }
  }, [selStartIdx, selEndIdx, data, reviews, tsData])

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
        pointRadius: 0, // ✅ no markers
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

  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    onClick: (_evt, elements) => {
      const idx = elements?.[0]?.index
      if (idx == null) return
      if (selStartIdx == null || (selStartIdx != null && selEndIdx != null)) {
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
          label: (ctx) => {
            const v = ctx.parsed.y
            if (ctx.dataset.label?.includes("น้ำมัน")) return `⛽ น้ำมัน: ${v} ลิตร`
            return `🚗 ความเร็ว: ${v} กม./ชม.`
          },
        },
      },
      zoom: {
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
        pan: { enabled: true, mode: "x" },
      },
      // ✅ feed windows into our plugin
      reviewedBands: {
        windows: reviewIndexWindows,
      } as any,
    } as any,
    scales: {
      x: {
        ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 },
      },
      y: { min: 0, title: { display: true, text: "ระดับน้ำมัน (ลิตร)" } },
      y1: { position: "right", min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: "ความเร็ว (กม./ชม.)" } },
    },
  }

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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to save review")
      }
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

  return (
    <div className="w-full space-y-4">
      <div className="text-sm text-gray-600 flex items-center gap-3">
        <span>Legend:</span>
        <span>🔵 พื้นหลังฟ้า = Reviewed</span>
        <span>⚪ ไม่มีพื้นหลัง = Unreviewed</span>
        <span className="text-xs text-gray-500">Tip: คลิก 2 ครั้งเพื่อเลือกช่วง</span>
      </div>

      <div className="h-[520px] rounded-xl border bg-white p-4 shadow-sm">
        <Chart type="bar" data={chartData} options={options} />
      </div>

      {selected ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold">Selected</div>
            <div className="text-sm">
              🚚 {selected.plate} | {selected.startDate} {selected.startTime} → {selected.endDate} {selected.endTime}
            </div>
            {selected.overlapped.length > 0 ? (
              <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">
                Reviewed overlap: {selected.overlapped.length}
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-100">
                Unreviewed
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Fuel start</div>
              <div className="text-lg font-bold">{selected.fuelStart}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Fuel end</div>
              <div className="text-lg font-bold">{selected.fuelEnd}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Fuel diff</div>
              <div className="text-lg font-bold">{selected.fuelDiff}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Duration (min)</div>
              <div className="text-lg font-bold">{selected.durationMin}</div>
            </div>
          </div>

          {/* If overlapped, show review details */}
          {selected.overlapped.length > 0 ? (
            <div className="rounded-lg border p-3 bg-blue-50/40">
              <div className="text-sm font-semibold mb-2">Reviewed records</div>
              <div className="space-y-2">
                {selected.overlapped.slice(0, 5).map((r: any) => (
                  <div key={String(r._id)} className="text-sm">
                    <div className="font-medium">{r.decision}</div>
                    <div className="text-xs text-gray-600">
                      by {r.reviewer || "-"} | note: {r.note || "-"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-600">
                ถ้าต้องการ “แก้ไข” ให้สร้าง revision ใหม่ (ไม่แก้ record เดิม)
              </div>
            </div>
          ) : null}

          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="text-xs text-gray-500">Decision</label>
              <select
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={decision}
                onChange={(e) => setDecision(e.target.value as Decision)}
              >
                <option value="reviewed_ok">Reviewed OK</option>
                <option value="reviewed_suspicious">Suspicious</option>
                <option value="false_positive">False Positive</option>
                <option value="need_follow_up">Need Follow-up</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-gray-500">Note</label>
              <input
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น เติมน้ำมัน / sensor glitch / แจ้งซ่อม"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="h-9 px-4 rounded-md border text-sm"
              onClick={() => {
                setSelStartIdx(null)
                setSelEndIdx(null)
              }}
              disabled={saving}
            >
              Clear
            </button>

            {selected.overlapped.length === 0 ? (
              <button
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                onClick={() => saveReview()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Mark as Reviewed"}
              </button>
            ) : (
              <button
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                onClick={() => saveReview(String(selected.overlapped[0]._id))}
                disabled={saving}
              >
                {saving ? "Saving..." : "Create revision"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
