// src/lib/fuel-analysis.ts
// วิเคราะห์ระดับน้ำมันจาก GPS log: ทำเส้นเฉลี่ย (ตัดน้ำมันกระฉอก) + หาจุดน้ำมันลด/เติม อัตโนมัติ
// pure functions — ไม่แตะ DB / React

export type FuelPoint = {
  ts: number // epoch ms
  fuel: number // ลิตร (ค่าดิบจากเซนเซอร์)
  speed: number // กม./ชม.
  status: string // "รถวิ่ง" | "จอดรถ" | "ดับเครื่อง" | อื่น ๆ
}

export type DetectOptions = {
  minDropL: number // ลดอย่างน้อยกี่ลิตร
  maxWindowMin: number // ภายในกี่นาที
  stationaryOnly: boolean // นับเฉพาะตอนรถจอด/ดับเครื่อง
}

export const DEFAULT_DETECT: DetectOptions = {
  minDropL: 15,
  maxWindowMin: 30,
  stationaryOnly: true,
}

export type FuelEventKind = "drop" | "gap_drop" | "refuel"

export type FuelEvent = {
  kind: FuelEventKind
  startIdx: number
  endIdx: number
  startTs: number
  endTs: number
  amount: number // ลิตร (บวกเสมอ)
  durationMin: number
  statusLabel: string // สถานะเด่นของช่วง เช่น "ดับเครื่อง"
}

const MIN = 60_000
const SMOOTH_WINDOW_MIN = 5 // หน้าต่าง median รอบจุด (±2.5 นาที)
const REFUEL_MIN_L = 20
const STATIONARY_SHARE = 0.8 // สัดส่วนจุดที่ต้องจอด/ดับเครื่องในช่วง
const MOVING_STATUS = "รถวิ่ง"

export const isStationary = (p: FuelPoint) => p.status !== MOVING_STATUS && p.speed <= 5

/**
 * Rolling median ตามเวลา (ไม่ใช่ตามจำนวนจุด) — ตัด spike จากน้ำมันกระฉอกสั้น ๆ
 * แต่คงการลดที่ค้างอยู่จริง; ไม่เฉลี่ยข้ามช่วงข้อมูลขาด (เพราะอิงเวลา)
 */
export function smoothFuel(points: FuelPoint[], windowMin = SMOOTH_WINDOW_MIN): number[] {
  const half = (windowMin * MIN) / 2
  const out = new Array<number>(points.length)
  let lo = 0
  let hi = 0
  for (let i = 0; i < points.length; i++) {
    const t = points[i].ts
    while (points[lo].ts < t - half) lo++
    while (hi + 1 < points.length && points[hi + 1].ts <= t + half) hi++
    const w: number[] = []
    for (let k = lo; k <= hi; k++) w.push(points[k].fuel)
    w.sort((a, b) => a - b)
    const m = w.length >> 1
    out[i] = w.length % 2 ? w[m] : (w[m - 1] + w[m]) / 2
  }
  return out
}

function stationaryShare(points: FuelPoint[], a: number, b: number) {
  let n = 0
  for (let k = a; k <= b; k++) if (isStationary(points[k])) n++
  return n / (b - a + 1)
}

function dominantStatus(points: FuelPoint[], a: number, b: number) {
  const count = new Map<string, number>()
  for (let k = a; k <= b; k++) {
    const s = points[k].status || "ไม่ทราบ"
    count.set(s, (count.get(s) ?? 0) + 1)
  }
  let best = "ไม่ทราบ"
  let bestN = -1
  for (const [s, n] of count) {
    if (n > bestN) {
      best = s
      bestN = n
    }
  }
  return best
}

function makeEvent(
  kind: FuelEventKind,
  points: FuelPoint[],
  a: number,
  b: number,
  amount: number,
  statusLabel?: string
): FuelEvent {
  return {
    kind,
    startIdx: a,
    endIdx: b,
    startTs: points[a].ts,
    endTs: points[b].ts,
    amount,
    durationMin: Math.round((points[b].ts - points[a].ts) / MIN),
    statusLabel: statusLabel ?? dominantStatus(points, a, b),
  }
}

/**
 * หาช่วงที่เส้นเฉลี่ยเปลี่ยน (ลด หรือ เพิ่ม) ≥ threshold ภายใน maxWindow
 * dir = -1 → ลด, +1 → เพิ่ม; ช่วงที่ได้ไม่ซ้อนกัน
 */
function sweep(
  points: FuelPoint[],
  s: number[],
  dir: -1 | 1,
  minL: number,
  maxWindowMs: number,
  accept: (a: number, b: number) => boolean
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  let i = 0
  while (i < points.length) {
    let ext = -1
    let extV = s[i]
    for (let j = i + 1; j < points.length && points[j].ts - points[i].ts <= maxWindowMs; j++) {
      if (dir < 0 ? s[j] < extV : s[j] > extV) {
        extV = s[j]
        ext = j
      }
    }
    if (ext >= 0 && (s[i] - extV) * -dir >= minL) {
      // ขยับจุดเริ่มไปที่จุดสูงสุด (ลด) / ต่ำสุด (เพิ่ม) ก่อนเริ่มเปลี่ยนจริง
      // (>= / <= → เอาจุดท้ายสุดที่ยังสูง/ต่ำสุด ให้ขอบเริ่มชิดจุดที่เปลี่ยนจริง)
      let start = i
      for (let k = i; k <= ext; k++) if (dir < 0 ? s[k] >= s[start] : s[k] <= s[start]) start = k
      const amount = (s[ext] - s[start]) * dir
      if (amount >= minL && accept(start, ext)) {
        out.push([start, ext, amount])
        i = ext + 1
        continue
      }
    }
    i++
  }
  return out
}

const MERGE_GAP_MS = 10 * MIN
const EDGE_TOLERANCE_L = 0.5

/**
 * รวมช่วงทิศเดียวกันที่ห่างกัน ≤ 10 นาที (การลดครั้งเดียวที่ sweep ตัดเป็นสองท่อน)
 * แล้วตัดขอบให้เหลือเฉพาะส่วนที่เปลี่ยนจริง
 */
function mergeAndTrim(
  ranges: Array<[number, number, number]>,
  points: FuelPoint[],
  s: number[],
  dir: -1 | 1
): Array<[number, number, number]> {
  const merged: Array<[number, number]> = []
  for (const [a, b] of ranges) {
    const last = merged[merged.length - 1]
    if (last && points[a].ts - points[last[1]].ts <= MERGE_GAP_MS) last[1] = b
    else merged.push([a, b])
  }
  return merged.map(([a, b]) => {
    let start = a
    let end = b
    // ขอบท้าย: จุดแรกที่ถึงระดับปลายทางแล้ว (±0.5 ลิตร)
    for (let k = a; k <= b; k++) {
      if ((s[k] - s[b]) * -dir <= EDGE_TOLERANCE_L) {
        end = k
        break
      }
    }
    // ขอบต้น: จุดสุดท้ายที่ยังอยู่ระดับตั้งต้น (±0.5 ลิตร)
    for (let k = end; k >= a; k--) {
      if ((s[a] - s[k]) * -dir <= EDGE_TOLERANCE_L) {
        start = k
        break
      }
    }
    return [start, end, (s[end] - s[start]) * dir] as [number, number, number]
  })
}

/** หาจุดน้ำมันลดผิดปกติ + ลดระหว่างข้อมูลขาดช่วง + จุดเติมน้ำมัน */
export function detectFuelEvents(
  points: FuelPoint[],
  smooth: number[],
  opts: DetectOptions = DEFAULT_DETECT
): FuelEvent[] {
  if (points.length < 2) return []
  const maxWindowMs = opts.maxWindowMin * MIN
  const events: FuelEvent[] = []

  const drops = sweep(points, smooth, -1, opts.minDropL, maxWindowMs, (a, b) =>
    opts.stationaryOnly ? stationaryShare(points, a, b) >= STATIONARY_SHARE : true
  )
  for (const [a, b, amt] of mergeAndTrim(drops, points, smooth, -1)) {
    events.push(makeEvent("drop", points, a, b, amt))
  }

  const refuels = sweep(points, smooth, 1, REFUEL_MIN_L, maxWindowMs, () => true)
  for (const [a, b, amt] of mergeAndTrim(refuels, points, smooth, 1)) {
    events.push(makeEvent("refuel", points, a, b, amt))
  }

  // ข้อมูลขาดช่วงนานกว่าหน้าต่าง (มักเป็นตอนดับเครื่องข้ามคืน) แต่น้ำมันก่อน/หลังต่างกันเกินเกณฑ์
  for (let k = 0; k + 1 < points.length; k++) {
    if (points[k + 1].ts - points[k].ts <= maxWindowMs) continue
    const diff = smooth[k] - smooth[k + 1]
    if (diff >= opts.minDropL) {
      events.push(makeEvent("gap_drop", points, k, k + 1, diff, "ข้อมูลขาดช่วง"))
    } else if (-diff >= REFUEL_MIN_L) {
      events.push(makeEvent("refuel", points, k, k + 1, -diff))
    }
  }

  return events.sort((x, y) => x.startTs - y.startTs)
}

/* ---------- เวลาไทย (UTC+7) สำหรับแสดงผล ---------- */

const TH_OFFSET = 7 * 60 * MIN
const pad = (n: number) => String(n).padStart(2, "0")
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

/** ชั่วโมงในเวลาไทย (0–23.99) */
export const thaiHour = (ts: number) => (((ts + TH_OFFSET) % (24 * 60 * MIN)) + 24 * 60 * MIN) % (24 * 60 * MIN) / (60 * MIN)

export const fmtThaiTime = (ts: number) => {
  const d = new Date(ts + TH_OFFSET)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export const fmtThaiDay = (ts: number) => {
  const d = new Date(ts + TH_OFFSET)
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`
}

export const fmtThaiDateTime = (ts: number) => `${fmtThaiDay(ts)} ${fmtThaiTime(ts)}`

/** เที่ยงคืนเวลาไทยของวันที่ ts อยู่ */
export const thaiMidnight = (ts: number) => {
  const day = 24 * 60 * MIN
  return Math.floor((ts + TH_OFFSET) / day) * day - TH_OFFSET
}

/** หา index ของจุดที่ ts ใกล้ที่สุด (points เรียงตามเวลา) */
export function nearestIndex(tsList: number[], ts: number) {
  let lo = 0
  let hi = tsList.length - 1
  if (hi < 0) return -1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (tsList[mid] < ts) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(tsList[lo - 1] - ts) <= Math.abs(tsList[lo] - ts)) return lo - 1
  return lo
}
