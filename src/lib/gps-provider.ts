// GPS provider per truck/day for the /engineon page. Pure — shared by /api/engineon/gps-provider
// and the page. Erasable TypeScript only, so `node --test` runs it without a build step.
//
// Source: gps.distance_<provider> (one doc per truck/day, vehicle_no "สบ.71-1515", date_key "YYYY-MM-DD").

export type ProviderKey =
  | "terminus" | "besttech" | "cartrack" | "hino" | "dtc" | "songdee" | "nostra" | "thaitracking"

export type ProviderDef = { key: ProviderKey; code: string; label: string; chip: string; solid: string }

export const PROVIDERS: ProviderDef[] = [
  { key: "terminus", code: "t", label: "Terminus", chip: "border-sky-300 text-sky-700 bg-sky-50", solid: "bg-sky-600 text-white border-sky-600" },
  { key: "besttech", code: "b", label: "Besttech", chip: "border-emerald-300 text-emerald-700 bg-emerald-50", solid: "bg-emerald-600 text-white border-emerald-600" },
  { key: "cartrack", code: "c", label: "Cartrack", chip: "border-orange-300 text-orange-700 bg-orange-50", solid: "bg-orange-600 text-white border-orange-600" },
  { key: "hino", code: "h", label: "Hino", chip: "border-rose-300 text-rose-700 bg-rose-50", solid: "bg-rose-600 text-white border-rose-600" },
  { key: "dtc", code: "d", label: "DTC", chip: "border-violet-300 text-violet-700 bg-violet-50", solid: "bg-violet-600 text-white border-violet-600" },
  { key: "songdee", code: "s", label: "Songdee", chip: "border-amber-300 text-amber-800 bg-amber-50", solid: "bg-amber-600 text-white border-amber-600" },
  { key: "nostra", code: "n", label: "Nostra", chip: "border-teal-300 text-teal-700 bg-teal-50", solid: "bg-teal-600 text-white border-teal-600" },
  { key: "thaitracking", code: "x", label: "Thaitracking", chip: "border-slate-300 text-slate-700 bg-slate-50", solid: "bg-slate-600 text-white border-slate-600" },
]

const BY_CODE = new Map(PROVIDERS.map((p) => [p.code, p]))
const BY_KEY = new Map(PROVIDERS.map((p) => [p.key, p]))

export const providerByKey = (key: string) => BY_KEY.get(key as ProviderKey)

/** API payload: plate -> date_key -> provider codes ("tb" = Terminus + Besttech that day) */
export type ProviderPayload = {
  from: string
  to: string
  days: Record<string, Record<string, string>>
  /** latest day seen before `from` (up to 180 days back): plate -> [date_key, codes] */
  prior: Record<string, [string, string]>
}

const PLATE_RE = /(\d{2})\s*[-–—]\s*(\d{4})/

/** "สบ.71-1515" / "71-1515 (แจ้งยกเลิก26.06.2026)" -> "71-1515"; other formats trimmed, "สบ." removed. */
export function plateKey(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim()
  const m = PLATE_RE.exec(text)
  if (m) return `${m[1]}-${m[2]}`
  return text.replace(/^สบ\.?/, "").trim()
}

/** Date from the summary API (ISO, midnight) -> "YYYY-MM-DD" */
export const dayKey = (d: string | Date) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10)

function addCode(codes: string, code: string) {
  return codes.includes(code) ? codes : [...codes + code].sort(codeOrder).join("")
}

const ORDER = PROVIDERS.map((p) => p.code).join("")
const codeOrder = (a: string, b: string) => ORDER.indexOf(a) - ORDER.indexOf(b)

/** Build the payload from raw rows (server side). */
export function buildPayload(
  from: string,
  to: string,
  rows: { provider: ProviderKey; vehicle_no: string; date_key: string }[],
): ProviderPayload {
  const days: ProviderPayload["days"] = {}
  const prior: ProviderPayload["prior"] = {}
  for (const r of rows) {
    const code = BY_KEY.get(r.provider)?.code
    const plate = plateKey(r.vehicle_no)
    if (!code || !plate || !r.date_key) continue
    if (r.date_key >= from && r.date_key <= to) {
      const byDate = (days[plate] ??= {})
      byDate[r.date_key] = addCode(byDate[r.date_key] ?? "", code)
    } else if (r.date_key < from) {
      const cur = prior[plate]
      if (!cur || r.date_key > cur[0]) prior[plate] = [r.date_key, code]
      else if (r.date_key === cur[0]) prior[plate] = [cur[0], addCode(cur[1], code)]
    }
  }
  return { from, to, days, prior }
}

export const decode = (codes: string): ProviderDef[] =>
  [...codes].map((c) => BY_CODE.get(c)).filter((p): p is ProviderDef => Boolean(p))

/** Providers that sent data for this truck on this day. */
export function providersOn(payload: ProviderPayload | null, plate: string, day: string): ProviderDef[] {
  if (!payload) return []
  return decode(payload.days[plateKey(plate)]?.[day] ?? "")
}

/** Latest day before `day` with GPS data, for the "ไม่มี GPS" tooltip. */
export function lastSeenBefore(
  payload: ProviderPayload | null, plate: string, day: string,
): { day: string; provider: ProviderDef | null } | null {
  if (!payload) return null
  const key = plateKey(plate)
  let best: string | null = null
  for (const d of Object.keys(payload.days[key] ?? {})) {
    if (d < day && (best === null || d > best)) best = d
  }
  if (best) return { day: best, provider: pickOne(decode(payload.days[key][best])) }
  const p = payload.prior[key]
  return p ? { day: p[0], provider: pickOne(decode(p[1])) } : null
}

/** Which provider the engine-on minutes came from (summary_engineon.version_type). */
export function engineSource(versionType: string | null | undefined): ProviderKey | null {
  if (versionType === "besttech") return "besttech"
  if (versionType === "v1" || versionType === "v2") return "terminus"
  return null
}

/** When a truck has more than one box the same day, show this one (the engine-on source wins first). */
const PICK_ORDER: ProviderKey[] = ["besttech", "terminus", "cartrack", "hino", "dtc", "songdee", "nostra", "thaitracking"]

/** One provider out of several, by PICK_ORDER. */
export function pickOne(list: ProviderDef[]): ProviderDef | null {
  for (const key of PICK_ORDER) {
    const hit = list.find((p) => p.key === key)
    if (hit) return hit
  }
  return list[0] ?? null
}

/** The single GPS provider of a summary row: the source of its engine-on minutes when it has
 *  any (gps.distance_* can lag a day), otherwise one of the providers that sent data that day. */
export function rowProvider(
  payload: ProviderPayload | null, plate: string, day: string, versionType: string | null | undefined,
): ProviderDef | null {
  const src = engineSource(versionType)
  if (src) return BY_KEY.get(src) ?? null
  return pickOne(providersOn(payload, plate, day))
}

/** Month range for the page filters; whole year when month is "all". */
export function rangeFor(year: number, month: number | "all"): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0")
  if (month === "all") return { from: `${year}-01-01`, to: `${year}-12-31` }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` }
}

/** "2026-09-29" -> "29/09/2569" */
export function thaiDate(day: string): string {
  const [y, m, d] = day.split("-")
  return `${d}/${m}/${Number(y) + 543}`
}
