// src/lib/dt-th.ts
// Parse Thai date string: "01/12/2025" + time "00:21:49" -> Date (local server time)
export function parseDDMMYYYY(dateStr: string) {
  const [dd, mm, yyyy] = dateStr.split("/").map(Number)
  if (!dd || !mm || !yyyy) return null
  // Use ISO style to avoid locale issues
  return { dd, mm, yyyy }
}

export function parseTimeHMS(timeStr: string) {
  const parts = (timeStr || "").split(":").map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const s = parts[2] ?? 0
  return { h, m, s }
}

export function toDateFromThai(dateStr: string, timeStr: string) {
  const d = parseDDMMYYYY(dateStr)
  if (!d) return null
  const t = parseTimeHMS(timeStr)
  // Construct Date in local timezone (your server runtime). Good enough for compare & store.
  return new Date(d.yyyy, d.mm - 1, d.dd, t.h, t.m, t.s, 0)
}

export function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart <= bEnd && bStart <= aEnd
}
