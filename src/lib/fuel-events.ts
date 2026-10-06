// คิวเหตุการณ์น้ำมัน (spec §5.1–5.2): ตัวกรองจาก URL → query ของ fuel_events, การเรียงตามลิตรที่น่าจะหาย,
// การเลื่อนไปเหตุการณ์ถัดไป และหลักฐานที่แสดงในแผงรายละเอียด
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { DailySummary, EventClass, EventStatus, FuelEvent, Source } from "./fuel-types"

export const STATUS_FILTERS = ["waiting", "decided", "follow_up", "auto_closed", "audit", "all"] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_GROUPS: Record<StatusFilter, EventStatus[] | null> = {
  waiting: ["open", "audit"],
  decided: ["decided"],
  follow_up: ["decided"],
  auto_closed: ["auto_closed"],
  audit: ["audit"],
  all: null,
}
/** ตัวกรองที่ต้องดูคำตัดสินด้วย — "ติดตาม" = ตัดสินแล้วว่าให้ตามต่อ (ไม่งั้นจมอยู่ในตัดสินแล้ว) */
const STATUS_DECISION: Partial<Record<StatusFilter, string>> = { follow_up: "follow_up" }
export const EVENT_CLASSES: readonly EventClass[] = [
  "suspected_loss", "gap_loss", "place_drop", "noise", "consumption", "refuel", "sensor_fault",
]
/** ไม่ขึ้นในคิวรอตรวจปกติ — ลดที่แพลนท์/จุดจอด (Part 2 แนะนำเป็นสัญญาณรบกวน) ดูได้จากชิป/ตัวกรองประเภทของมันเอง */
export const QUEUE_HIDDEN_CLASSES: readonly EventClass[] = ["place_drop"]
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

/** เลขวัน (UTC) ของ "YYYY-MM-DD" ที่เป็นวันจริง ไม่งั้น null — เหมือน isDateKey ใน thai-time แต่ไฟล์นี้ import ได้แค่ type */
function dayNumber(key: string): number | null {
  if (!DATE_RE.test(key)) return null
  const [y, m, d] = key.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  return real ? date.getTime() / 86_400_000 : null
}

export function parseEventFilter(params: URLSearchParams, defaultDay: string): Parsed<EventFilter> {
  const from = params.get("from") || defaultDay
  const to = params.get("to") || from
  const fromDay = dayNumber(from)
  const toDay = dayNumber(to)
  if (fromDay === null || toDay === null) return { ok: false, error: "from / to ต้องเป็นวันที่จริงแบบ YYYY-MM-DD" }
  if (toDay < fromDay) return { ok: false, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" }
  if (toDay - fromDay + 1 > MAX_RANGE_DAYS) {
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

/** คิวปกติ = รอตรวจ และไม่ได้เลือกประเภท → ซ่อน QUEUE_HIDDEN_CLASSES */
export const isDefaultQueue = (filter: { status: StatusFilter; cls: EventClass | "" | null }) => filter.status === "waiting" && !filter.cls

export function buildEventsQuery(filter: EventFilter): Record<string, unknown> {
  const query: Record<string, unknown> = { date_key: { $gte: filter.from, $lte: filter.to } }
  const statuses = STATUS_GROUPS[filter.status]
  if (statuses) query.status = { $in: statuses }
  const decision = STATUS_DECISION[filter.status]
  if (decision) query.decision = decision
  if (filter.cls) query.class = filter.cls
  else if (isDefaultQueue(filter)) query.class = { $nin: QUEUE_HIDDEN_CLASSES }
  if (filter.source) query.sources = filter.source
  if (filter.branch) query.branch = filter.branch
  if (filter.fleet) query.fleet = filter.fleet
  if (filter.plant) query.plant = filter.plant
  return query
}

/** ความหมายเดียวกับ buildEventsQuery — ใช้กรอง fixture ในโหมดตัวอย่าง */
export function matchesFilter(
  e: Pick<FuelEvent, "date_key" | "status" | "decision" | "class" | "sources" | "branch" | "fleet" | "plant">,
  filter: EventFilter,
): boolean {
  const statuses = STATUS_GROUPS[filter.status]
  const decision = STATUS_DECISION[filter.status]
  return (
    e.date_key >= filter.from &&
    e.date_key <= filter.to &&
    (!statuses || statuses.includes(e.status)) &&
    (!decision || e.decision === decision) &&
    (filter.cls ? e.class === filter.cls : !(isDefaultQueue(filter) && QUEUE_HIDDEN_CLASSES.includes(e.class))) &&
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

/** rankKey ในรูป expression ของ Mongo */
const RANK_EXPR = { $multiply: [{ $ifNull: ["$p_real_loss", 0] }, { $max: [{ $ifNull: ["$litres", 0] }, 0] }] }

/** คิวจาก fuel_events: เรียงทั้งช่วงในฐานข้อมูลก่อนตัดเหลือ limit (ลำดับเดียวกับ rankEvents) — วันหนึ่งมีเกือบพันเหตุการณ์ */
export function buildEventsPipeline(filter: EventFilter): Record<string, unknown>[] {
  return [
    { $match: buildEventsQuery(filter) },
    { $addFields: { _rank: RANK_EXPR } },
    { $sort: { _rank: -1, start: 1 } },
    { $limit: filter.limit },
    { $project: { features: 0, _rank: 0 } },
  ]
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0)
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** การ์ดเช้านี้: สรุปจากงานกลางคืนที่ขาดบางฟิลด์ยังแสดงได้ — ตัวเลขที่ไม่มีเป็น 0, รายการที่ไม่มีเป็นว่าง */
export function summaryWithDefaults(raw: Partial<DailySummary> & { _id: string }): DailySummary {
  const byStatus = raw.by_status
  return {
    ...raw,
    trucks_expected: num(raw.trucks_expected),
    trucks_analysed: num(raw.trucks_analysed),
    by_status: byStatus && typeof byStatus === "object" ? byStatus : {},
    events: num(raw.events),
    auto_closed: num(raw.auto_closed),
    open: num(raw.open),
    audit: num(raw.audit),
    likely_litres: num(raw.likely_litres),
    check_first: list<string>(raw.check_first),
    sources_missing: list<Source>(raw.sources_missing),
    ai_text: typeof raw.ai_text === "string" ? raw.ai_text : null,
  }
}

/** หัวรายการคิว — บอก "แสดง X จาก Y" เมื่อรายการถูกตัดที่ limit */
export function listCaption(shown: number, total: number): string {
  const order = "เรียงตามลิตรที่น่าจะหาย"
  if (total <= shown) return `${shown} เหตุการณ์ · ${order}`
  const hint = shown >= MAX_LIMIT ? " — ลดช่วงวันที่หรือใช้ตัวกรองเพื่อดูที่เหลือ" : ""
  return `แสดง ${shown} จาก ${total} เหตุการณ์ · ${order}${hint}`
}

/** ปุ่ม "แสดงเพิ่ม": limit ถัดไป (ไม่เกิน MAX_LIMIT) หรือ null เมื่อแสดงครบหรือถึงเพดานแล้ว */
export function nextLimit(limit: number, total: number): number | null {
  return total > limit && limit < MAX_LIMIT ? Math.min(MAX_LIMIT, total) : null
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
