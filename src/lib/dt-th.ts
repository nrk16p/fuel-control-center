// src/lib/dt-th.ts
// Parse Thai date string: "01/12/2025" + time "00:21:49" -> Date (Asia/Bangkok → UTC timestamp)

export function parseDDMMYYYY(dateStr: string) {
  const [dd, mm, yyyy] = dateStr.split("/").map(Number)
  if (!dd || !mm || !yyyy) return null
  return { dd, mm, yyyy }
}

export function parseTimeHMS(timeStr: string) {
  const parts = (timeStr || "").split(":").map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const s = parts[2] ?? 0
  return { h, m, s }
}

/**
 * Convert Thai date/time (Asia/Bangkok) to a Date whose timestamp is correct in UTC.
 * This prevents +7h shift when comparing with start_ts / end_ts in DB.
 */
export function toDateFromThai(dateStr: string, timeStr: string) {
  const d = parseDDMMYYYY(dateStr)
  if (!d) return null
  const t = parseTimeHMS(timeStr)

  // Thailand is UTC+7 → convert to UTC by subtracting 7 hours
  const TH_OFFSET_HOURS = 7

  const utcMs = Date.UTC(
    d.yyyy,
    d.mm - 1,
    d.dd,
    t.h - TH_OFFSET_HOURS,
    t.m,
    t.s,
    0
  )

  return new Date(utcMs)
}

export function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart <= bEnd && bStart <= aEnd
}
