// คิวเหตุการณ์น้ำมัน (spec §5.1–5.2): ตัวกรองจาก URL → query ของ fuel_events, การเรียงตามลิตรที่น่าจะหาย,
// การเลื่อนไปเหตุการณ์ถัดไป และหลักฐานที่แสดงในแผงรายละเอียด
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { EventClass, EventStatus, FuelEvent, Source } from "./fuel-types"

export const STATUS_FILTERS = ["waiting", "decided", "auto_closed", "audit", "all"] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_GROUPS: Record<StatusFilter, EventStatus[] | null> = {
  waiting: ["open", "audit"],
  decided: ["decided"],
  auto_closed: ["auto_closed"],
  audit: ["audit"],
  all: null,
}
export const EVENT_CLASSES: readonly EventClass[] = ["suspected_loss", "gap_loss", "noise", "consumption", "refuel", "sensor_fault"]
export const SOURCES: readonly Source[] = ["besttech", "terminus"]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_RANGE_DAYS = 31
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 500

export type EventFilter = {
  from: string
  to: string
  status: StatusFilter
  cls: EventClass | null
  source: Source | null
  branch: string | null
  fleet: string | null
  plant: string | null
  limit: number
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseEventFilter(params: URLSearchParams, defaultDay: string): Parsed<EventFilter> {
  const from = params.get("from") || defaultDay
  const to = params.get("to") || from
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return { ok: false, error: "from / to ต้องเป็น YYYY-MM-DD" }
  if (to < from) return { ok: false, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
    return { ok: false, error: `เลือกได้ไม่เกิน ${MAX_RANGE_DAYS} วัน` }
  }
  const status = params.get("status") || "waiting"
  if (!(STATUS_FILTERS as readonly string[]).includes(status)) return { ok: false, error: "status ไม่ถูกต้อง" }
  const cls = params.get("class") || null
  if (cls && !(EVENT_CLASSES as readonly string[]).includes(cls)) return { ok: false, error: "ประเภทเหตุการณ์ไม่ถูกต้อง" }
  const source = params.get("source") || null
  if (source && !(SOURCES as readonly string[]).includes(source)) return { ok: false, error: "แหล่ง GPS ไม่ถูกต้อง" }
  const rawLimit = Number(params.get("limit") || DEFAULT_LIMIT)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT) : DEFAULT_LIMIT
  const text = (key: string) => params.get(key)?.trim() || null
  return {
    ok: true,
    value: {
      from,
      to,
      status: status as StatusFilter,
      cls: cls as EventClass | null,
      source: source as Source | null,
      branch: text("branch"),
      fleet: text("fleet"),
      plant: text("plant"),
      limit,
    },
  }
}

export function buildEventsQuery(filter: EventFilter): Record<string, unknown> {
  const query: Record<string, unknown> = { date_key: { $gte: filter.from, $lte: filter.to } }
  const statuses = STATUS_GROUPS[filter.status]
  if (statuses) query.status = { $in: statuses }
  if (filter.cls) query.class = filter.cls
  if (filter.source) query.sources = filter.source
  if (filter.branch) query.branch = filter.branch
  if (filter.fleet) query.fleet = filter.fleet
  if (filter.plant) query.plant = filter.plant
  return query
}

/** ความหมายเดียวกับ buildEventsQuery — ใช้กรอง fixture ในโหมดตัวอย่าง */
export function matchesFilter(
  e: Pick<FuelEvent, "date_key" | "status" | "class" | "sources" | "branch" | "fleet" | "plant">,
  filter: EventFilter,
): boolean {
  const statuses = STATUS_GROUPS[filter.status]
  return (
    e.date_key >= filter.from &&
    e.date_key <= filter.to &&
    (!statuses || statuses.includes(e.status)) &&
    (!filter.cls || e.class === filter.cls) &&
    (!filter.source || e.sources.includes(filter.source)) &&
    (!filter.branch || e.branch === filter.branch) &&
    (!filter.fleet || e.fleet === filter.fleet) &&
    (!filter.plant || e.plant === filter.plant)
  )
}

/** ลิตรที่น่าจะหาย = p_real_loss × litres (ตัวเรียงคิว) */
export const rankKey = (e: Pick<FuelEvent, "p_real_loss" | "litres">) => (e.p_real_loss || 0) * Math.max(e.litres || 0, 0)

type Rankable = Pick<FuelEvent, "p_real_loss" | "litres"> & { start: string | Date }

export function rankEvents<T extends Rankable>(events: T[]): T[] {
  return [...events].sort((a, b) => rankKey(b) - rankKey(a) || new Date(a.start).getTime() - new Date(b.start).getTime())
}

/** /api/fuel/events?… — ข้ามค่าว่าง */
export function eventsUrl(input: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `/api/fuel/events?${qs}` : "/api/fuel/events"
}

/** URL ของเหตุการณ์หนึ่งตัว — _id มี "|" และอักษรไทยจึงต้อง encode */
export const eventPath = (id: string) => `/api/fuel/events/${encodeURIComponent(id)}`

/** J/K: ตัวถัดไป/ก่อนหน้าในรายการ (หยุดที่ปลาย) */
export function neighbourId(ids: string[], current: string | null, step: 1 | -1): string | null {
  if (!ids.length) return null
  const at = current ? ids.indexOf(current) : -1
  if (at < 0) return step > 0 ? ids[0] : ids[ids.length - 1]
  const next = at + step
  return next >= 0 && next < ids.length ? ids[next] : ids[at]
}

const isWaiting = (e: Pick<FuelEvent, "status">) => e.status === "open" || e.status === "audit"

/** หลังบันทึก: เหตุการณ์ที่ยังรอตรวจตัวถัดไป (วนกลับต้นรายการ) */
export function nextWaitingId(events: Pick<FuelEvent, "_id" | "status">[], current: string): string | null {
  const at = events.findIndex((e) => e._id === current)
  for (let i = at + 1; i < events.length; i++) if (isWaiting(events[i])) return events[i]._id
  for (let i = 0; i < at; i++) if (isWaiting(events[i])) return events[i]._id
  return null
}

const yesNo = (v: number | boolean | string) => (v ? "ใช่" : "ไม่")
const FEATURE_ROWS: [string, string, (v: number | boolean | string) => string][] = [
  ["duration_min", "ระยะเวลา", (v) => `${v} นาที`],
  ["rate_l_per_min", "อัตรา", (v) => `${Number(v).toFixed(1)} L/นาที`],
  ["excess_over_burn_l", "เกินการใช้ปกติ", (v) => `${Number(v).toFixed(1)} L`],
  ["engine_off_share", "เครื่องดับระหว่างเหตุการณ์", (v) => `${Math.round(Number(v) * 100)}%`],
  ["recovered_120", "ระดับกลับขึ้นใน 2 ชม.", yesNo],
  ["gap_min", "สัญญาณขาดนานสุด", (v) => `${v} นาที`],
  ["sensor_noise_parked", "สัญญาณรบกวนของเซนเซอร์", (v) => `${Number(v).toFixed(1)}% ของถัง`],
  ["night", "กลางคืน", yesNo],
  ["at_place", "อยู่ในแพลนท์/อู่", yesNo],
  ["both_boxes", "เห็นตรงกันทั้ง 2 กล่อง GPS", yesNo],
]

/** หลักฐานในแผงรายละเอียด: ขนาดก่อน แล้วเฉพาะ feature ที่ Part 2 ส่งมา */
export function evidenceRows(e: Pick<FuelEvent, "litres" | "pct_tank" | "features" | "place">): { label: string; value: string }[] {
  const pct = e.pct_tank != null ? ` (${e.pct_tank.toFixed(1)}% ของถัง)` : ""
  const rows = [{ label: "ปริมาณ", value: `${e.litres.toFixed(1)} L${pct}` }]
  for (const [key, label, format] of FEATURE_ROWS) {
    const value = e.features?.[key]
    if (value !== undefined && value !== null) rows.push({ label, value: format(value) })
  }
  if (e.place?.name) rows.push({ label: "สถานที่", value: e.place.name })
  return rows
}
