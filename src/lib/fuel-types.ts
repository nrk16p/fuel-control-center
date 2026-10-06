// รูปร่างข้อมูลที่หน้า /fueldetection อ่าน — spec §3.1, §4.6–4.8 (Part 2 เขียน fuel_events / fuel_daily_summary)
// มีแต่ type: import ได้จากทุกที่ (รวมโมดูลที่รันใต้ node --test) ด้วย `import type`

export type Source = "besttech" | "terminus"
export type EventKind = "drop" | "refuel" | "gap"
export type EventClass = "noise" | "consumption" | "refuel" | "sensor_fault" | "suspected_loss" | "gap_loss"
export type EventStatus = "open" | "auto_closed" | "audit" | "decided"
export type Suggestion = "real_loss" | "noise" | "legit"
export type Decision = Suggestion | "follow_up"
export type CoverageStatus = "ok" | "no_sensor" | "offline" | "stuck" | "no_data"

export type EventPlace = { name: string | null; lat: number | null; lng: number | null }

/** analytics.fuel_events ในรูปที่ API ส่งออก (Date → ISO string, ObjectId → hex) */
export type FuelEvent = {
  _id: string
  plate: string
  truck_code: string | null
  driver: string | null
  /** spec §5.1 ตัวกรอง/รายงานตามสาขา-ฟลีท-แพลนท์ — Part 2 ยังไม่เขียน จึงอ่านเมื่อมีเท่านั้น */
  fleet?: string | null
  branch?: string | null
  plant?: string | null
  date_key: string
  start: string
  end: string
  sources: Source[]
  kind: EventKind
  class: EventClass
  litres: number
  pct_tank: number | null
  score: number
  p_real_loss: number
  suggestion: Suggestion
  confidence: number
  reasons: string[]
  action: string | null
  /** หลักฐาน spec §4.3 + ของ Part 2 (level_before, level_after, both_boxes, …) — รายการคิวตัดออกด้วย projection */
  features?: Record<string, number | boolean | string | null>
  place: EventPlace | null
  status: EventStatus
  decision: Decision | null
  review_id: string | null
  scorer: string
  stale: boolean
  /** Part 3 ตั้งเป็น true ตอนตัดสินเหตุการณ์ที่มาจากการตรวจสุ่ม */
  audit?: boolean
  created_at?: string
  updated_at?: string
}

/** analytics.fuel_events ตามที่เก็บจริง (Part 2 เขียน start/end เป็น Date, review_id เป็น ObjectId) */
export type FuelEventDoc = Omit<FuelEvent, "start" | "end" | "review_id" | "created_at" | "updated_at"> & {
  start: Date
  end: Date
  review_id: unknown
  created_at?: Date
  updated_at?: Date
}

export type DailySummary = {
  _id: string
  trucks_expected: number
  trucks_analysed: number
  by_status: Partial<Record<CoverageStatus | "sparse", number>>
  events: number
  auto_closed: number
  open: number
  audit: number
  decided?: number
  likely_litres: number
  check_first: string[]
  sources_missing: Source[]
  ai_text: string | null
}

/** price_per_litre = null จนกว่าทีมจะตั้ง (รายงานแสดงแค่ลิตร) — ตรงกับ DEFAULTS ของ Part 2 */
export type FuelSettings = { auto_close_conf: number; audit_rate: number; price_per_litre: number | null }

export type CoverageRow = {
  plate: string
  source: Source
  truck_code: string | null
  status: CoverageStatus
  minutes: number
  fuel_valid_share: number
  last: string | null
  moved_km: number
  tank_l: number
  tank_from: string
}
