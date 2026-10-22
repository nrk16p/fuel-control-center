// Engine-on events for one Besttech truck/day, built live from Besttech /history points.
// Same rules as api-ncac scripts/fuel/besttech_derived.py (and the Terminus job), so the detail
// page matches the daily total on /engineon:
//   parked with the engine on = state "ON_STOP" (or engine ON and speed 0 when state is missing)
//   a pair of consecutive engine-on points 0 < gap <= 5 min adds its gap to the event
//   a move > 200 m between two pairs starts a new event
//   an event whose centre is within 200 m of an atms.plants point gets that plant's code
// Nothing here touches the network or the database.

export const MAX_GAP_MIN = 5
export const MAX_DIST_M = 200
export const RATE_LIMIT_PER_MIN = 5

export interface BesttechPoint {
  gps_time?: string
  lat?: number | string
  lng?: number | string
  speed?: number | string
  engine?: string
  state?: string
}

export interface Plant {
  code: string
  lat: number
  lng: number
}

/** Same shape as an analytics.raw_engineon doc, so EngineonDetailClient renders it as is. */
export interface LiveEvent {
  _id: string
  ทะเบียนพาหนะ: string
  date: string
  version_type: "besttech"
  event_id: number
  start_time: string
  end_time: string
  total_engine_on_min: number
  total_engine_on_hr: number
  count_records: number
  lat: number
  lng: number
  nearest_plant: string | null
}

interface Row {
  t: number          // Thai wall-clock time as a UTC epoch (ms), the way raw_engineon stores it
  lat: number
  lng: number
  on: boolean
}

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180
  const p1 = lat1 * r
  const p2 = lat2 * r
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lng2 - lng1) * r) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, a)))
}

export function parkedEngineOn(p: BesttechPoint): boolean {
  if (p.state) return p.state === "ON_STOP"
  return String(p.engine ?? "").toUpperCase() === "ON" && (num(p.speed) ?? 0) === 0
}

/** "2026-10-21 08:15:00" (Thai time) -> epoch ms with the same wall clock in UTC. */
export function thaiTimeMs(text: string | undefined): number | null {
  const m = TIME_RE.exec(String(text ?? "").trim())
  if (!m) return null
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

export function cleanPoints(points: BesttechPoint[], day: string): Row[] {
  const rows: Row[] = []
  for (const p of points ?? []) {
    const t = thaiTimeMs(p.gps_time)
    const lat = num(p.lat)
    const lng = num(p.lng)
    if (t === null || lat === null || lng === null || (lat === 0 && lng === 0)) continue
    if (new Date(t).toISOString().slice(0, 10) !== day) continue
    rows.push({ t, lat, lng, on: parkedEngineOn(p) })
  }
  return rows.sort((a, b) => a.t - b.t)
}

export function nearestPlant(lat: number, lng: number, plants: Plant[]): string | null {
  let best: Plant | null = null
  let bestD = Infinity
  for (const p of plants) {
    const d = haversineM(lat, lng, p.lat, p.lng)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best && bestD <= MAX_DIST_M ? best.code : null
}

/** Engine-on events of `plate` ("70-6291") on `day` ("2026-10-21"), latest event first. */
export function buildEvents(plate: string, day: string, points: BesttechPoint[], plants: Plant[]): LiveEvent[] {
  const rows = cleanPoints(points, day)
  type Acc = { start: number; end: number; min: number; sumLat: number; sumLng: number; n: number }
  const events: Acc[] = []
  let prevPair: Row | null = null
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const cur = rows[i]
    const gap = (cur.t - prev.t) / 60000
    if (!(prev.on && cur.on && gap > 0 && gap <= MAX_GAP_MIN)) continue
    if (prevPair === null || haversineM(prevPair.lat, prevPair.lng, cur.lat, cur.lng) > MAX_DIST_M) {
      events.push({ start: prev.t, end: cur.t, min: 0, sumLat: 0, sumLng: 0, n: 0 })
    }
    const e = events[events.length - 1]
    e.end = cur.t
    e.min += gap
    e.sumLat += cur.lat
    e.sumLng += cur.lng
    e.n += 1
    prevPair = cur
  }
  const out = events.map((e, i): LiveEvent => {
    const lat = e.sumLat / e.n
    const lng = e.sumLng / e.n
    return {
      _id: `${plate}_${day}_${i + 1}`,
      ทะเบียนพาหนะ: plate,
      date: day,
      version_type: "besttech",
      event_id: i + 1,
      start_time: new Date(e.start).toISOString(),
      end_time: new Date(e.end).toISOString(),
      total_engine_on_min: e.min,
      total_engine_on_hr: e.min / 60,
      count_records: e.n,
      lat,
      lng,
      nearest_plant: nearestPlant(lat, lng, plants),
    }
  })
  return out.reverse()
}

/** "ME152 (71-8635 สบ.)" / "70-6294 สบ." / "สบ.70-6294" -> "70-6294"; null when no plate number. */
export function besttechPlate(vehicleNo: string | undefined): string | null {
  const m = /(\d{1,3})\s*-\s*(\d{4})/.exec(String(vehicleNo ?? ""))
  return m ? `${m[1]}-${m[2]}` : null
}

/** "70-6291_2026-10-21" (optionally with a _d1 dedup suffix) -> { plate, day } */
export function parseDetailId(id: string): { plate: string; day: string } | null {
  const m = /^(.+)_(\d{4}-\d{2}-\d{2})(?:_d\d+)?$/.exec(String(id ?? "").trim())
  return m ? { plate: m[1], day: m[2] } : null
}

export function minuteOf(nowMs: number): number {
  return Math.floor(nowMs / 60000)
}

/** Seconds until the next minute's budget opens. */
export function retryAfterSeconds(nowMs: number): number {
  return Math.max(1, 60 - Math.floor((nowMs % 60000) / 1000))
}

/** After counting `cost` more calls this minute (`usedAfter` = the counter including them). */
export function withinBudget(usedAfter: number, limit = RATE_LIMIT_PER_MIN): boolean {
  return usedAfter <= limit
}
