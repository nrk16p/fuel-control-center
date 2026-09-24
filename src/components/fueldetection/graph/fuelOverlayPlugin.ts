import type { Chart, Plugin } from "chart.js"
import { fmtThaiDay, thaiMidnight } from "@/lib/fuel-analysis"

// ชั้นวาดทับกราฟ: กลางคืน, เส้นแบ่งวัน, ช่วงรีวิว/ช่วงที่เลือก, แถบสถานะรถ, หมุดเติม/หมุดจุดน่าสงสัย
// ข้อมูลอ่านจาก chart.$fuelOverlay (ตั้งจาก React ผ่าน ref) — ไม่ผ่าน options เพื่อไม่ให้ zoom ถูกรีเซ็ต

export type OverlayBand = { startTs: number; endTs: number; tone: "clay" | "forest" | "muted"; strength?: number }
export type OverlayMarker = { n: number; ts: number; fuel: number; tone: "clay" | "muted"; selected: boolean }
export type OverlayRefuel = { ts: number; fuel: number; amount: number }

export type FuelOverlay = {
  ts: number[]
  status: string[]
  bands: OverlayBand[]
  markers: OverlayMarker[]
  refuels: OverlayRefuel[]
  selection: { startTs: number; endTs: number | null } | null
}

type ChartWithOverlay = Chart & { $fuelOverlay?: FuelOverlay }

export const OVERLAY_COLORS = {
  forest: "#2F5D46",
  forestDark: "#1F4232",
  clay: "#B35A36",
  muted: "#8C958F",
  ink: "#23302A",
  surface: "#FFFDF7",
  statusRun: "#2F5D46",
  statusPark: "#E8C467",
  statusOff: "#B9B3A3",
  statusOther: "#DDE3DC",
} as const

const STATUS_COLOR: Record<string, string> = {
  รถวิ่ง: OVERLAY_COLORS.statusRun,
  จอดรถ: OVERLAY_COLORS.statusPark,
  ดับเครื่อง: OVERLAY_COLORS.statusOff,
}

const TONE_RGB = { clay: "179,90,54", forest: "47,93,70", muted: "94,107,99" } as const

const HOUR = 3_600_000
const DAY = 24 * HOUR
const STATUS_STRIP_H = 8
const MAX_STATUS_GAP = 15 * 60_000 // ห่างเกินนี้ถือว่าไม่มีข้อมูล (ไม่ระบายสี)

export const fuelOverlayPlugin: Plugin = {
  id: "fuelOverlay",

  beforeDatasetsDraw(chart) {
    const o = (chart as ChartWithOverlay).$fuelOverlay
    const { ctx, chartArea: a, scales } = chart
    const x = scales.x
    if (!o || !a || !x) return
    const min = x.min
    const max = x.max
    const px = (ts: number) => x.getPixelForValue(ts)

    ctx.save()
    ctx.beginPath()
    ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top)
    ctx.clip()

    // กลางคืน 18:00–06:00 (เวลาไทย)
    ctx.fillStyle = "rgba(35,48,42,0.045)"
    for (let d = thaiMidnight(min) - DAY; d <= max + DAY; d += DAY) {
      const l = px(d - 6 * HOUR)
      const r = px(d + 6 * HOUR)
      ctx.fillRect(l, a.top, r - l, a.bottom - a.top)
    }

    // เส้นแบ่งวัน + ชื่อวัน
    ctx.strokeStyle = "rgba(94,107,99,0.55)"
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.font = "600 12px Anuphan, sans-serif"
    ctx.fillStyle = OVERLAY_COLORS.ink
    for (let d = thaiMidnight(min); d <= max; d += DAY) {
      const p = px(d)
      if (d > min) {
        ctx.beginPath()
        ctx.moveTo(p, a.top)
        ctx.lineTo(p, a.bottom)
        ctx.stroke()
      }
      // ป้ายวันแรกชิดซ้าย — ข้ามถ้าเส้นแบ่งวันถัดไปอยู่ใกล้จนป้ายชนกัน
      if (d < min && px(d + DAY) - a.left < 70) continue
      ctx.fillText(fmtThaiDay(Math.max(d, min)), Math.max(p, a.left) + 6, a.top + 14)
    }
    ctx.setLineDash([])

    // ช่วงรีวิว / ช่วงที่ระบบพบ
    for (const b of o.bands) {
      const l = px(b.startTs)
      const r = px(b.endTs)
      ctx.fillStyle = `rgba(${TONE_RGB[b.tone]},${b.strength ?? 0.1})`
      ctx.fillRect(l, a.top, Math.max(r - l, 2), a.bottom - a.top)
    }

    // ช่วงที่เลือก
    if (o.selection) {
      const l = px(o.selection.startTs)
      const r = o.selection.endTs != null ? px(o.selection.endTs) : l
      ctx.fillStyle = "rgba(179,90,54,0.14)"
      ctx.fillRect(l, a.top, Math.max(r - l, 0), a.bottom - a.top)
      ctx.strokeStyle = OVERLAY_COLORS.clay
      ctx.lineWidth = 1.5
      for (const edge of o.selection.endTs != null ? [l, r] : [l]) {
        ctx.beginPath()
        ctx.moveTo(edge, a.top)
        ctx.lineTo(edge, a.bottom)
        ctx.stroke()
      }
    }

    ctx.restore()
  },

  afterDatasetsDraw(chart) {
    const o = (chart as ChartWithOverlay).$fuelOverlay
    const { ctx, chartArea: a, scales } = chart
    const x = scales.x
    const y = scales.y
    if (!o || !a || !x || !y) return
    const px = (ts: number) => x.getPixelForValue(ts)
    const inView = (p: number) => p >= a.left - 1 && p <= a.right + 1

    ctx.save()
    ctx.beginPath()
    ctx.rect(a.left, a.top - 30, a.right - a.left, a.bottom - a.top + 30)
    ctx.clip()

    // แถบสถานะรถ (ล่างสุดของพื้นที่กราฟ)
    const stripY = a.bottom - STATUS_STRIP_H
    for (let i = 0; i < o.ts.length - 1; ) {
      const s = o.status[i]
      let j = i
      while (j + 1 < o.ts.length && o.status[j + 1] === s && o.ts[j + 1] - o.ts[j] <= MAX_STATUS_GAP) j++
      const end = j + 1 < o.ts.length && o.ts[j + 1] - o.ts[j] <= MAX_STATUS_GAP ? o.ts[j + 1] : o.ts[j]
      const l = px(o.ts[i])
      const r = px(end)
      if (r >= a.left && l <= a.right) {
        ctx.fillStyle = STATUS_COLOR[s] ?? OVERLAY_COLORS.statusOther
        ctx.fillRect(l, stripY, Math.max(r - l, 1), STATUS_STRIP_H)
      }
      i = j + 1
    }

    // หมุดเติมน้ำมัน
    ctx.font = "600 12px Anuphan, sans-serif"
    ctx.textAlign = "center"
    for (const r of o.refuels) {
      const p = px(r.ts)
      if (!inView(p)) continue
      const top = y.getPixelForValue(r.fuel) - 12
      ctx.fillStyle = OVERLAY_COLORS.forest
      ctx.beginPath()
      ctx.moveTo(p - 6, top)
      ctx.lineTo(p, top - 10)
      ctx.lineTo(p + 6, top)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = OVERLAY_COLORS.forestDark
      ctx.fillText(`+${Math.round(r.amount)} ล.`, p, top - 14)
    }

    // หมุดจุดน่าสงสัย
    for (const m of o.markers) {
      const p = px(m.ts)
      if (!inView(p)) continue
      const cy = Math.max(a.top + 26, y.getPixelForValue(m.fuel) - 22)
      const color = m.tone === "clay" ? OVERLAY_COLORS.clay : OVERLAY_COLORS.muted
      if (m.selected) {
        ctx.beginPath()
        ctx.arc(p, cy, 15, 0, Math.PI * 2)
        ctx.fillStyle = OVERLAY_COLORS.surface
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(p, cy, 10, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.fillStyle = OVERLAY_COLORS.surface
      ctx.textBaseline = "middle"
      ctx.fillText(String(m.n), p, cy + 0.5)
      ctx.textBaseline = "alphabetic"
    }

    ctx.restore()
  },
}
