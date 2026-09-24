"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Tooltip,
  Decimation,
  type ChartData,
  type ChartOptions,
  type ChartEvent,
  type Scale,
  type TooltipItem,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"
import { fuelOverlayPlugin, OVERLAY_COLORS, type FuelOverlay } from "./fuelOverlayPlugin"
import { fmtThaiDateTime, fmtThaiDay, fmtThaiTime, nearestIndex, thaiMidnight } from "@/lib/fuel-analysis"

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Tooltip,
  Decimation,
  zoomPlugin,
  fuelOverlayPlugin
)

export type FocusRange = { min: number; max: number; key: number }

interface Props {
  ts: number[]
  raw: number[]
  smooth: number[]
  speed: number[]
  status: string[]
  overlay: Omit<FuelOverlay, "ts" | "status">
  focus: FocusRange | null
  onSelectIndex: (idx: number) => void
}

type Pt = { x: number; y: number }
type FuelChartJS = ChartJS<"line", Pt[]> & { $fuelOverlay?: FuelOverlay }

const MIN = 60_000
const HOUR = 60 * MIN
// ระยะห่างของ tick แกนเวลา — เลือกอันแรกที่ทำให้มี ≤ 12 tick
const TICK_STEPS = [15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR]

const LEGEND = [
  { label: "น้ำมัน (เฉลี่ย ตัดการกระฉอก)", swatch: "h-[3px] w-[18px] rounded bg-forest" },
  { label: "ค่าดิบจากเซนเซอร์", swatch: "h-[2px] w-[18px] bg-[#9DB5A6]" },
  { label: "ความเร็ว", swatch: "h-2.5 w-3.5 rounded-sm bg-[#C9D6CC]" },
  { label: "จุดน่าสงสัยที่ระบบพบ", swatch: "h-3.5 w-3.5 rounded-full bg-clay" },
  { label: "รถวิ่ง", swatch: "h-2 w-3.5 rounded-sm bg-forest" },
  { label: "จอดรถ", swatch: "h-2 w-3.5 rounded-sm bg-butter" },
  { label: "ดับเครื่อง", swatch: "h-2 w-3.5 rounded-sm bg-[#B9B3A3]" },
  { label: "กลางคืน 18:00–06:00", swatch: "h-2 w-3.5 rounded-sm bg-ink/10" },
]

const toggleClass = (on: boolean) =>
  `h-9 rounded-[12px] border border-line-input px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-forest ${
    on ? "bg-mint text-forest-dark" : "bg-surface text-muted-ink"
  }`

export function FuelChart({ ts, raw, smooth, speed, status, overlay, focus, onSelectIndex }: Props) {
  const chartRef = useRef<FuelChartJS | null>(null)
  const [showRaw, setShowRaw] = useState(true)
  const [showSpeed, setShowSpeed] = useState(true)

  // ค่าที่ callback ของ Chart.js ต้องอ่าน — เก็บใน ref เพื่อให้ options คงที่ (options เปลี่ยน = zoom รีเซ็ต)
  const live = useRef({ ts, raw, smooth, speed, status, onSelectIndex })
  useEffect(() => {
    live.current = { ts, raw, smooth, speed, status, onSelectIndex }
  }, [ts, raw, smooth, speed, status, onSelectIndex])

  // ส่ง overlay ให้ plugin แล้ววาดใหม่ (ไม่ update options)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.$fuelOverlay = { ts, status, ...overlay }
    chart.draw()
  }, [ts, status, overlay])

  // ซูมไปยังช่วงที่เลือกจากรายการ
  useEffect(() => {
    if (!focus) return
    chartRef.current?.zoomScale("x", { min: focus.min, max: focus.max }, "none")
  }, [focus])

  const fuelMax = useMemo(() => {
    let m = 0
    for (const v of raw) if (v > m) m = v
    return Math.ceil((m * 1.15) / 50) * 50 || 100
  }, [raw])

  const chartData: ChartData<"line", Pt[]> = useMemo(
    () => ({
      datasets: [
        {
          label: "น้ำมัน (เฉลี่ย)",
          data: ts.map((x, i) => ({ x, y: smooth[i] })),
          yAxisID: "y",
          borderColor: OVERLAY_COLORS.forest,
          backgroundColor: OVERLAY_COLORS.forest,
          borderWidth: 2.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0,
          order: 1,
        },
        {
          label: "ค่าดิบ",
          data: ts.map((x, i) => ({ x, y: raw[i] })),
          yAxisID: "y",
          borderColor: "#9DB5A6",
          borderWidth: 1.1,
          pointRadius: 0,
          pointHoverRadius: 0,
          hidden: !showRaw,
          order: 2,
        },
        {
          label: "ความเร็ว",
          data: ts.map((x, i) => ({ x, y: speed[i] })),
          yAxisID: "y1",
          borderColor: "transparent",
          backgroundColor: "rgba(201,214,204,0.7)",
          fill: "origin",
          borderWidth: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          stepped: true,
          hidden: !showSpeed,
          order: 3,
        },
      ],
    }),
    [ts, raw, smooth, speed, showRaw, showSpeed]
  )

  // options คงที่ตลอดอายุ component — ข้อมูลที่เปลี่ยนอ่านผ่าน live ref / scale ที่คำนวณใหม่
  const chartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: { mode: "nearest", axis: "x", intersect: false },

      onClick: (event: ChartEvent) => {
        const chart = chartRef.current
        if (!chart || event.x == null) return
        const a = chart.chartArea
        if (event.x < a.left || event.x > a.right) return
        const value = chart.scales.x.getValueForPixel(event.x)
        if (value == null) return
        const idx = nearestIndex(live.current.ts, value)
        if (idx >= 0) live.current.onSelectIndex(idx)
      },

      plugins: {
        legend: { display: false },
        decimation: { enabled: true, algorithm: "lttb", samples: 1500, threshold: 3000 },
        tooltip: {
          backgroundColor: "#FFFDF7",
          borderColor: "#E3DDCC",
          borderWidth: 1,
          titleColor: "#23302A",
          bodyColor: "#3E4D45",
          padding: 10,
          titleFont: { size: 13, weight: "bold" },
          bodyFont: { size: 12 },
          displayColors: false,
          filter: (item: TooltipItem<"line">) => item.datasetIndex === 0,
          callbacks: {
            title: (items: TooltipItem<"line">[]) => {
              const x = items[0]?.parsed.x
              return x == null ? "" : fmtThaiDateTime(x)
            },
            label: (item: TooltipItem<"line">) => {
              const d = live.current
              const i = nearestIndex(d.ts, item.parsed.x ?? 0)
              if (i < 0) return ""
              const delta = i > 0 ? d.smooth[i] - d.smooth[i - 1] : 0
              return [
                `น้ำมัน ${d.smooth[i].toFixed(1)} ล. (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} จากจุดก่อน)`,
                `ค่าดิบ ${d.raw[i].toFixed(1)} ล.`,
                `ความเร็ว ${Math.round(d.speed[i])} กม./ชม. · ${d.status[i] || "ไม่ทราบสถานะ"}`,
              ]
            },
          },
        },
        zoom: {
          zoom: { wheel: { enabled: true, speed: 0.1 }, pinch: { enabled: true }, drag: { enabled: false }, mode: "x" },
          pan: { enabled: true, mode: "x" },
          limits: { x: { min: "original", max: "original" } },
        },
      },

      scales: {
        x: {
          type: "linear",
          bounds: "data", // แกนเริ่ม/จบตรงกับข้อมูล ไม่ปัดเป็นเลขกลม
          grid: { display: false },
          // tick ตรงชั่วโมงเวลาไทย และขึ้นชื่อวันที่เที่ยงคืน
          afterBuildTicks: (scale: Scale) => {
            const range = scale.max - scale.min
            const step = TICK_STEPS.find((s) => range / s <= 12) ?? 24 * HOUR
            const first = thaiMidnight(scale.min) + Math.ceil((scale.min - thaiMidnight(scale.min)) / step) * step
            const ticks = []
            for (let v = first; v <= scale.max; v += step) ticks.push({ value: v })
            scale.ticks = ticks
          },
          ticks: {
            maxRotation: 0,
            autoSkip: false,
            color: "#5E6B63",
            font: { size: 11 },
            callback: (v) => {
              const n = Number(v)
              return n === thaiMidnight(n) ? fmtThaiDay(n) : fmtThaiTime(n)
            },
          },
        },
        y: {
          type: "linear",
          position: "left",
          min: 0,
          suggestedMax: fuelMax,
          title: { display: true, text: "ลิตร", color: "#5E6B63", font: { size: 12 } },
          ticks: { color: "#5E6B63" },
          grid: { color: "#EDE8DA" },
        },
        y1: {
          type: "linear",
          position: "right",
          min: 0,
          max: 300, // ความเร็วใช้แค่ ⅓ ล่างของกราฟ ไม่บังเส้นน้ำมัน
          title: { display: true, text: "กม./ชม.", color: "#5E6B63", font: { size: 11 } },
          ticks: { color: "#5E6B63", stepSize: 50, callback: (v) => (Number(v) <= 100 ? v : "") },
          grid: { drawOnChartArea: false },
        },
      },
    }),
    // fuelMax: เปลี่ยนเฉพาะตอนโหลดข้อมูลชุดใหม่ (ซึ่ง zoom ควรรีเซ็ตอยู่แล้ว)
    [fuelMax]
  )

  return (
    <section className="rounded-[22px] border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">กราฟระดับน้ำมันและความเร็ว</h2>
          <p className="text-[13px] text-muted-ink">
            เลื่อนล้อเมาส์เพื่อซูม · ลากเพื่อเลื่อน · คลิก 2 จุดบนกราฟเพื่อเลือกช่วง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={showRaw} onClick={() => setShowRaw((v) => !v)} className={toggleClass(showRaw)}>
            ค่าดิบจากเซนเซอร์
          </button>
          <button type="button" aria-pressed={showSpeed} onClick={() => setShowSpeed((v) => !v)} className={toggleClass(showSpeed)}>
            ความเร็ว
          </button>
          <button
            type="button"
            onClick={() => chartRef.current?.resetZoom("none")}
            className="h-9 rounded-[12px] border border-line-input bg-surface px-3 text-[13px] font-medium text-forest outline-none focus-visible:ring-2 focus-visible:ring-forest"
          >
            รีเซ็ตซูม
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-body">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={l.swatch} aria-hidden />
            {l.label}
          </span>
        ))}
      </div>

      <div className="h-[480px]">
        <Chart
          ref={chartRef as never}
          type="line"
          data={chartData}
          options={chartOptions}
          aria-label="กราฟระดับน้ำมันและความเร็ว"
        />
      </div>
    </section>
  )
}
