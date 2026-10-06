// Jobs tab catalog and parameter rules (fuel spec §10). Pure — shared by the /pipeline page and the
// /api/pipeline/[type] proxy. Erasable TypeScript only, so `node --test` runs it without a build step.

export type FieldKind = "date" | "number" | "text" | "checkbox" | "select"
export type FormValue = string | boolean | undefined
export type FormState = Record<string, FormValue>

export type JobField = {
  key: string
  label: string
  kind: FieldKind
  /** payload key sent to the proxy (api-ncac upper-cases it into an env var); absent = UI-only */
  param?: string
  placeholder?: string
  /** half-width in the form grid (date pairs) */
  half?: boolean
  options?: { value: string; label: string }[]
  defaultValue?: string | boolean
}

export type JobDef = {
  type: string
  ncacType: string
  name: string
  description: string
  schedule: string
  dateFormat: "dmy" | "iso"
  maxDays?: number
  fields: JobField[]
}

export type FollowUp = { type: string; name: string; payload: Record<string, string | number> }
export type RunPlan =
  | { ok: true; payload: Record<string, string | number>; followUps: FollowUp[] }
  | { ok: false; errors: string[] }

const startEnd = (param = true): JobField[] => [
  { key: "start_date", label: "วันเริ่ม (ว่าง = เมื่อวาน)", kind: "date", param: param ? "start_date" : undefined, half: true },
  { key: "end_date", label: "วันสิ้นสุด", kind: "date", param: param ? "end_date" : undefined, half: true },
]

export const JOBS: JobDef[] = [
  {
    type: "overspeed", ncacType: "overspeed", name: "Overspeed",
    description: "ช่วงความเร็ว 60–70 และเกิน 70 กม./ชม. จาก GPS Terminus → หน้า /overspeed",
    schedule: "อัตโนมัติทุกวัน 04:30", dateFormat: "dmy", maxDays: 7,
    fields: [
      ...startEnd(),
      { key: "plates", label: "ทะเบียน (ว่าง = ทุกคัน)", kind: "text", param: "plates", placeholder: "71-8623, 72-5504" },
      { key: "min_duration_min", label: "นานกว่า (นาที)", kind: "number", param: "min_duration_min", defaultValue: "2" },
      { key: "min_records", label: "จำนวนจุดอย่างน้อย", kind: "number", param: "min_records", defaultValue: "5" },
      { key: "gap_minutes", label: "ช่องว่างตัดช่วง (นาที)", kind: "number", param: "gap_minutes", defaultValue: "2" },
    ],
  },
  {
    type: "rmc-compensation", ncacType: "rmc_compensation", name: "CPAC RMC compensation",
    description: "เที่ยวรถโม่ CPAC fleetlink → เวลาที่ไซต์ → ส่งค่าชดเชย (ว่างทุกช่อง = ตามเก็บวันที่ค้างถึงเมื่อวาน)",
    schedule: "อัตโนมัติทุกวัน 09:00", dateFormat: "iso", maxDays: 14,
    fields: [
      { key: "date", label: "วันเดียว", kind: "date", param: "date" },
      { key: "start", label: "หรือ ช่วง: วันเริ่ม", kind: "date", param: "start", half: true },
      { key: "end", label: "ช่วง: วันสิ้นสุด", kind: "date", param: "end", half: true },
      { key: "dry_run", label: "ทดลอง (ดึง + คำนวณ ไม่ส่งข้อมูล)", kind: "checkbox", param: "dry_run", defaultValue: false },
    ],
  },
  {
    type: "engineon", ncacType: "engineon", name: "Engine-On",
    description: "จอดติดเครื่องจาก GPS Terminus → raw/summary engine-on",
    schedule: "อัตโนมัติทุกวัน 04:00 (logic ปัจจุบัน)", dateFormat: "dmy", maxDays: 7,
    fields: [
      ...startEnd(),
      { key: "max_distance", label: "ระยะรวมจุด (เมตร)", kind: "number", param: "max_distance", defaultValue: "200" },
      {
        key: "engine_logic", label: "Logic", kind: "select", param: "engine_logic", defaultValue: "current",
        options: [
          { value: "current", label: "ปัจจุบัน (เหมือนรอบอัตโนมัติ)" },
          { value: "v2", label: "v2 — กล่อง v1 นับจอดทุกจุดเป็นติดเครื่อง" },
        ],
      },
      { key: "rebuild_summary", label: "สร้าง trip summary ของเดือนที่กระทบใหม่", kind: "checkbox", defaultValue: true },
    ],
  },
  {
    type: "fuel-series-besttech", ncacType: "fuel_series_besttech", name: "Fuel series — Besttech",
    description: "จุด GPS + น้ำมันรายนาทีของรถ Besttech → gps_series (~76 นาที/วัน)",
    schedule: "อัตโนมัติทุกวัน 01:30", dateFormat: "dmy", maxDays: 3,
    fields: [
      ...startEnd(),
      { key: "force", label: "ดึงใหม่แม้มีข้อมูลแล้ว", kind: "checkbox", param: "force", defaultValue: false },
    ],
  },
  {
    type: "fuel-series-terminus", ncacType: "fuel_series_terminus", name: "Fuel series — Terminus",
    description: "จุด GPS + น้ำมันรายนาทีของรถ Terminus → gps_series",
    schedule: "อัตโนมัติทุกวัน 04:15 (ใน fuel nightly)", dateFormat: "dmy", maxDays: 7,
    fields: [
      ...startEnd(),
      { key: "plates", label: "ทะเบียน (ว่าง = ทุกคัน)", kind: "text", param: "plates", placeholder: "71-8623" },
    ],
  },
  {
    type: "fuel-nightly", ncacType: "fuel_nightly", name: "Fuel nightly",
    description: "รอบกลางคืน: Besttech ตามเก็บ (ถ้าขาด) → Terminus ของเมื่อวาน",
    schedule: "อัตโนมัติทุกวัน 04:15", dateFormat: "dmy", fields: [],
  },
  {
    type: "fuel-tanks", ncacType: "fuel_tanks", name: "Fuel tanks",
    description: "ขนาดถังต่อคัน (ATMS → เทียบสองกล่อง → ค่าสูงสุดที่เห็น → 200 ลิตร)",
    schedule: "รันเองเมื่อต้องการ", dateFormat: "iso",
    fields: [
      { key: "calib_from", label: "เทียบสองกล่อง ตั้งแต่ (ว่าง = 1 มิ.ย. 2026)", kind: "date", param: "calib_from", half: true },
      { key: "calib_to", label: "ถึง (ว่าง = 31 ส.ค. 2026)", kind: "date", param: "calib_to", half: true },
    ],
  },
]

/** UI type → api-ncac pipeline type (the four ETL-tab jobs + the Jobs tab). */
export const TYPE_MAP: Record<string, string> = {
  drivercost: "drivercost_ticket",
  vehiclemaster: "vehiclemaster",
  "engineon-trip-summary": "engineon_trip_summary",
  ...Object.fromEntries(JOBS.map((j) => [j.type, j.ncacType])),
}

/** Body keys each type may forward; everything else is dropped by the proxy. */
const LEGACY_PARAMS: Record<string, string[]> = {
  engineon: ["start_date", "end_date", "max_distance", "save_raw", "save_summary"],
  drivercost: ["year", "month"],
  vehiclemaster: [],
  "engineon-trip-summary": ["year", "month", "version_type"],
}

export function allowedParams(type: string): string[] {
  const job = JOBS.find((j) => j.type === type)
  const fromJob = job ? job.fields.flatMap((f) => (f.param ? [f.param] : [])) : []
  return Array.from(new Set([...(LEGACY_PARAMS[type] ?? []), ...fromJob]))
}

export function pickAllowed(type: string, body: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(allowedParams(type))
  return Object.fromEntries(
    Object.entries(body ?? {}).filter(([k, v]) => allowed.has(k) && v !== undefined && v !== null && v !== ""),
  )
}

export function initialForm(job: JobDef): FormState {
  return Object.fromEntries(job.fields.map((f) => [f.key, f.defaultValue ?? (f.kind === "checkbox" ? false : "")]))
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

const dayCount = (startIso: string, endIso: string) => (Date.parse(endIso) - Date.parse(startIso)) / DAY_MS + 1
const toDmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const text = (v: FormValue) => (typeof v === "string" ? v.trim() : "")

/** Yesterday in Bangkok as YYYY-MM-DD (what the pipelines use when no dates are sent). */
export function yesterdayBkk(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000 - DAY_MS).toISOString().slice(0, 10)
}

export function monthsBetween(startIso: string, endIso: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  let y = Number(startIso.slice(0, 4))
  let m = Number(startIso.slice(5, 7))
  const endY = Number(endIso.slice(0, 4))
  const endM = Number(endIso.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function checkRange(startIso: string, endIso: string, label: string, maxDays: number | undefined, errors: string[]) {
  if (!ISO.test(startIso) || !ISO.test(endIso)) {
    errors.push(`${label}: ต้องเลือกทั้งวันเริ่มและวันสิ้นสุด`)
    return
  }
  const days = dayCount(startIso, endIso)
  if (days < 1) errors.push(`${label}: วันสิ้นสุดต้องไม่ก่อนวันเริ่ม`)
  else if (maxDays && days > maxDays) errors.push(`${label}: ได้ไม่เกิน ${maxDays} วันต่อครั้ง (เลือกไว้ ${days} วัน)`)
}

/** Validate a Jobs-tab form and build the proxy payload (+ follow-up runs). */
export function buildRun(job: JobDef, form: FormState, now: Date = new Date()): RunPlan {
  const errors: string[] = []
  const payload: Record<string, string | number> = {}
  const fmt = (iso: string) => (job.dateFormat === "dmy" ? toDmy(iso) : iso)
  const keys = new Set(job.fields.map((f) => f.key))

  if (keys.has("start_date")) {
    const start = text(form.start_date)
    const end = text(form.end_date)
    if (start || end) {
      checkRange(start, end, "ช่วงวันที่", job.maxDays, errors)
      payload.start_date = fmt(start)
      payload.end_date = fmt(end)
    }
  }
  if (keys.has("date")) {
    const day = text(form.date)
    const start = text(form.start)
    const end = text(form.end)
    if (day && (start || end)) errors.push("เลือกได้อย่างใดอย่างหนึ่ง: วันเดียว หรือ ช่วงวันที่")
    else if (day && !ISO.test(day)) errors.push("วันเดียว: วันที่ไม่ถูกต้อง")
    else if (day) payload.date = day
    else if (start || end) {
      checkRange(start, end, "ช่วงวันที่", job.maxDays, errors)
      payload.start = start
      payload.end = end
    }
  }
  if (keys.has("calib_from")) {
    const from = text(form.calib_from)
    const to = text(form.calib_to)
    if (from || to) {
      checkRange(from, to, "ช่วงเทียบสองกล่อง", undefined, errors)
      payload.calib_from = from
      payload.calib_to = to
    }
  }
  for (const field of job.fields) {
    if (!field.param) continue
    const value = form[field.key]
    if (field.kind === "number") {
      const raw = text(value)
      if (!/^\d+$/.test(raw) || Number(raw) <= 0) errors.push(`${field.label}: ต้องเป็นจำนวนเต็มบวก`)
      else payload[field.param] = Number(raw)
    } else if (field.kind === "text") {
      const plates = text(value).split(",").map((p) => p.trim()).filter(Boolean)
      if (plates.length) payload[field.param] = plates.join(",")
    } else if (field.kind === "checkbox" && value === true) {
      payload[field.param] = "1"
    } else if (field.kind === "select") {
      const choice = text(value)
      if (!field.options?.some((o) => o.value === choice)) errors.push(`${field.label}: ตัวเลือกไม่ถูกต้อง`)
      else payload[field.param] = choice
    }
  }
  if (errors.length) return { ok: false, errors }

  const followUps: FollowUp[] = []
  if (job.type === "engineon" && form.rebuild_summary === true) {
    const start = typeof payload.start_date === "string" ? text(form.start_date) : yesterdayBkk(now)
    const end = typeof payload.end_date === "string" ? text(form.end_date) : start
    for (const { year, month } of monthsBetween(start, end)) {
      followUps.push({ type: "engineon-trip-summary", name: `Trip summary ${month}/${year}`, payload: { year, month } })
    }
  }
  return { ok: true, payload, followUps }
}

/** `/api/etl_jobs` filters: `?job_type=overspeed&limit=5` (limit 1–200, default 50). */
export function etlJobsQuery(params: URLSearchParams): { filter: Record<string, string>; limit: number } {
  const jobType = (params.get("job_type") ?? "").trim()
  const n = Number(params.get("limit"))
  return { filter: jobType ? { job_type: jobType } : {}, limit: Number.isInteger(n) && n > 0 ? Math.min(n, 200) : 50 }
}

/** "45 วิ" · "12 นาที" · "1.5 ชม." for the last-runs table. */
export function formatDuration(sec: number | null | undefined): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "-"
  if (sec < 60) return `${Math.round(sec)} วิ`
  if (sec < 3600) return `${Math.round(sec / 60)} นาที`
  return `${(sec / 3600).toFixed(1)} ชม.`
}
