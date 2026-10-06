// gps_series (Part 1) → เส้นข้อมูลสำหรับกราฟ: ถอดคอลัมน์, แปลงเป็นลิตร, ต่อหลายวัน, ตัดช่วงเวลา, สถานะข้อมูล
// รันใต้ `node --test` ได้: ตัวถอดรหัส (series-codec) ถูกส่งเข้ามาเป็นอาร์กิวเมนต์ ไม่ import ตอนรัน

import type { BinaryLike, FuelUnit, SeriesColumns } from "./series-codec"
import type { CoverageRow, CoverageStatus, Source } from "./fuel-types"

/** analytics.gps_series หนึ่งเอกสาร = ทะเบียน × วัน × แหล่ง (spec §3.1); coverage.first / last เป็น "HH:MM" เวลาไทย */
export type SeriesDoc = {
  plate: string
  truck_code?: string | null
  date_key: string
  date: string | Date
  source: Source
  fuel_unit: FuelUnit
  tank_l: number
  tank_from?: string
  n: number
  cols?: Record<string, BinaryLike>
  coverage: {
    status: CoverageStatus
    minutes: number
    fuel_valid_share?: number
    first?: string | null
    last?: string | null
    moved_km?: number
  }
}

export type Codec = {
  decodeColumns: (cols: Record<string, BinaryLike>, n: number) => SeriesColumns
  fuelToLitres: (values: number[], unit: FuelUnit, tankL: number) => (number | null)[]
  toDegrees: (values: number[]) => (number | null)[]
}

export type SourceSeries = {
  source: Source
  tankL: number
  ts: number[]
  fuel: (number | null)[]
  lo: (number | null)[]
  hi: (number | null)[]
  speed: number[]
  engine: number[]
  status: string[]
  lat: (number | null)[]
  lng: (number | null)[]
}

export const PARKED_KMH = 5
const MINUTE_MS = 60_000

/** สถานะแบบเดียวกับแถบสีของกราฟเดิม */
export function statusOf(speed: number, engine: number): string {
  if (!engine) return "ดับเครื่อง"
  return speed > PARKED_KMH ? "รถวิ่ง" : "จอดรถ"
}

function emptySeries(source: Source, tankL: number): SourceSeries {
  return { source, tankL, ts: [], fuel: [], lo: [], hi: [], speed: [], engine: [], status: [], lat: [], lng: [] }
}

/** เอกสารหลายวัน/หลายแหล่ง (ลำดับใดก็ได้) → หนึ่งเส้นต่อแหล่ง เรียงตามเวลา; นาทีที่ไม่มีค่าน้ำมันเป็น null */
export function buildSeries(docs: SeriesDoc[], codec: Codec): SourceSeries[] {
  const bySource = new Map<Source, SourceSeries>()
  const usable = docs.filter((d) => d.n > 0 && d.cols).sort((a, b) => a.date_key.localeCompare(b.date_key))
  for (const doc of usable) {
    const cols = codec.decodeColumns(doc.cols as Record<string, BinaryLike>, doc.n)
    const dayStart = new Date(doc.date).getTime()
    const series = bySource.get(doc.source) ?? emptySeries(doc.source, doc.tank_l)
    bySource.set(doc.source, series)
    series.tankL = doc.tank_l
    const fuel = codec.fuelToLitres(cols.fuel, doc.fuel_unit, doc.tank_l)
    const lo = codec.fuelToLitres(cols.fuelLo, doc.fuel_unit, doc.tank_l)
    const hi = codec.fuelToLitres(cols.fuelHi, doc.fuel_unit, doc.tank_l)
    const lat = codec.toDegrees(cols.lat)
    const lng = codec.toDegrees(cols.lng)
    for (let i = 0; i < doc.n; i++) {
      series.ts.push(dayStart + cols.m[i] * MINUTE_MS)
      series.fuel.push(fuel[i])
      series.lo.push(lo[i])
      series.hi.push(hi[i])
      series.speed.push(cols.speed[i])
      series.engine.push(cols.engine[i])
      series.status.push(statusOf(cols.speed[i], cols.engine[i]))
      series.lat.push(lat[i])
      series.lng.push(lng[i])
    }
  }
  return [...bySource.values()]
}

/** เฉพาะนาทีในช่วง [fromMs, toMs] */
export function sliceWindow(series: SourceSeries, fromMs: number, toMs: number): SourceSeries {
  const keep: number[] = []
  series.ts.forEach((t, i) => {
    if (t >= fromMs && t <= toMs) keep.push(i)
  })
  const pick = <T>(values: T[]) => keep.map((i) => values[i])
  return {
    ...series,
    ts: pick(series.ts),
    fuel: pick(series.fuel),
    lo: pick(series.lo),
    hi: pick(series.hi),
    speed: pick(series.speed),
    engine: pick(series.engine),
    status: pick(series.status),
    lat: pick(series.lat),
    lng: pick(series.lng),
  }
}

/** ระดับน้ำมันของนาทีที่ใกล้ ts ที่สุด (ข้ามนาทีที่ไม่มีค่า) — ใช้ปักหมุดบนกราฟ */
export function levelAt(series: SourceSeries, ts: number): number {
  let best = 0
  let bestGap = Infinity
  series.ts.forEach((t, i) => {
    const value = series.fuel[i]
    if (value == null) return
    const gap = Math.abs(t - ts)
    if (gap < bestGap) {
      bestGap = gap
      best = value
    }
  })
  return best
}

/** พิกัดของนาทีที่ใกล้ ts ที่สุดจากทุกแหล่ง (ใช้เมื่อเหตุการณ์ไม่มี place) */
export function pointNear(seriesList: SourceSeries[], ts: number): { lat: number; lng: number } | null {
  let best: { lat: number; lng: number } | null = null
  let bestGap = Infinity
  for (const series of seriesList) {
    series.ts.forEach((t, i) => {
      const lat = series.lat[i]
      const lng = series.lng[i]
      if (lat == null || lng == null) return
      const gap = Math.abs(t - ts)
      if (gap < bestGap) {
        bestGap = gap
        best = { lat, lng }
      }
    })
  }
  return best
}

export type CoverageVerdict = { kind: CoverageStatus; sources: Source[] }
const VERDICT_ORDER: CoverageStatus[] = ["ok", "stuck", "no_sensor", "offline", "no_data"]

/** ok ถ้ามีวัน/แหล่งไหนข้อมูลน้ำมันใช้ได้ ไม่งั้นบอกสาเหตุ (เรียงจากดีสุดไปแย่สุด) */
export function coverageVerdict(days: { source: Source; status: CoverageStatus }[]): CoverageVerdict {
  for (const status of VERDICT_ORDER) {
    const hits = days.filter((d) => d.status === status)
    if (hits.length) return { kind: status, sources: [...new Set(hits.map((d) => d.source))] }
  }
  return { kind: "no_data", sources: [] }
}

export type LastSeen = { date_key: string; source: Source; time: string | null; lat: number | null; lng: number | null }

/** เอกสารล่าสุดที่ n > 0 → วัน, เวลา (coverage.last), ตำแหน่งสุดท้าย — แบนเนอร์ "ไม่มีข้อมูล" ใช้บอกว่าหายไปตั้งแต่เมื่อไรและที่ไหน */
export function lastSeenOf(doc: SeriesDoc, codec: Codec): LastSeen {
  const [series] = buildSeries([doc], codec)
  let lat: number | null = null
  let lng: number | null = null
  for (let i = (series?.ts.length ?? 0) - 1; i >= 0; i--) {
    if (series.lat[i] != null && series.lng[i] != null) {
      lat = series.lat[i]
      lng = series.lng[i]
      break
    }
  }
  return { date_key: doc.date_key, source: doc.source, time: doc.coverage.last ?? null, lat, lng }
}

const STATUS_RANK: Record<CoverageStatus, number> = { no_data: 0, offline: 1, no_sensor: 2, stuck: 3, ok: 4 }

/** ตารางสถานะข้อมูลรายคัน: ปัญหาขึ้นก่อน */
export function coverageRows(docs: SeriesDoc[]): CoverageRow[] {
  return docs
    .map((d) => ({
      plate: d.plate,
      source: d.source,
      truck_code: d.truck_code ?? null,
      status: d.coverage.status,
      minutes: d.coverage.minutes,
      fuel_valid_share: d.coverage.fuel_valid_share ?? 0,
      last: d.coverage.last ?? null,
      moved_km: d.coverage.moved_km ?? 0,
      tank_l: d.tank_l,
      tank_from: d.tank_from ?? "default",
    }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.plate.localeCompare(b.plate) || a.source.localeCompare(b.source))
}
