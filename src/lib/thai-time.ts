// เวลาไทย (UTC+7) — ไม่พึ่งโมดูลอื่น ใช้ได้ทั้งฝั่ง Next และใต้ `node --test`
// fuel-analysis.ts re-export ฟังก์ชันแสดงผลจากไฟล์นี้

export const TH_OFFSET_MS = 7 * 3_600_000
export const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const pad = (n: number) => String(n).padStart(2, "0")
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

/** ชั่วโมงในเวลาไทย (0–23.99) */
export const thaiHour = (ts: number) => ((((ts + TH_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS

export const fmtThaiTime = (ts: number) => {
  const d = new Date(ts + TH_OFFSET_MS)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export const fmtThaiDay = (ts: number) => {
  const d = new Date(ts + TH_OFFSET_MS)
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`
}

export const fmtThaiDateTime = (ts: number) => `${fmtThaiDay(ts)} ${fmtThaiTime(ts)}`

/** เที่ยงคืนเวลาไทยของวันที่ ts อยู่ */
export const thaiMidnight = (ts: number) => Math.floor((ts + TH_OFFSET_MS) / DAY_MS) * DAY_MS - TH_OFFSET_MS

/** "YYYY-MM-DD" ตามวันเวลาไทย — รูปแบบเดียวกับ date_key ใน analytics */
export function thaiDateKey(ts: number): string {
  const d = new Date(ts + TH_OFFSET_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 00:00 เวลาไทยของ date_key → epoch ms */
export function dayStartMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number)
  return Date.UTC(y, m - 1, d) - TH_OFFSET_MS
}

export const addDays = (dateKey: string, days: number) => thaiDateKey(dayStartMs(dateKey) + days * DAY_MS)

export const yesterdayKey = (nowMs: number) => addDays(thaiDateKey(nowMs), -1)

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** "YYYY-MM-DD" ที่เป็นวันจริงเท่านั้น — 2026-02-30 / 9999-99-99 ไม่ผ่าน (แปลงไปกลับต้องได้ค่าเดิม) */
export const isDateKey = (key: string) => DATE_KEY_RE.test(key) && thaiDateKey(dayStartMs(key)) === key

/** จำนวนวันตั้งแต่ from ถึง to รวมปลาย — คำนวณตรง ไม่วนลูป (to ก่อน from → ≤ 0) */
export const daySpan = (fromKey: string, toKey: string) => Math.round((dayStartMs(toKey) - dayStartMs(fromKey)) / DAY_MS) + 1

/** ช่วงยาวสุดที่ dateKeysBetween ยอมสร้าง (รายงานเลือกได้ไม่เกิน 366 วัน) */
export const MAX_DATE_KEYS = 366

/** ทุก date_key ตั้งแต่ from ถึง to (รวมปลายทั้งสอง) — คีย์ที่ไม่ใช่วันจริงหรือช่วงเกิน MAX_DATE_KEYS โยน RangeError ก่อนวนลูป */
export function dateKeysBetween(fromKey: string, toKey: string): string[] {
  if (!isDateKey(fromKey) || !isDateKey(toKey)) throw new RangeError(`date_key ไม่ถูกต้อง: ${fromKey} – ${toKey}`)
  const span = daySpan(fromKey, toKey)
  if (span > MAX_DATE_KEYS) throw new RangeError(`ช่วงวันที่ยาวเกิน ${MAX_DATE_KEYS} วัน`)
  const keys: string[] = []
  for (let i = 0; i < span; i++) keys.push(addDays(fromKey, i))
  return keys
}

/** ทุกวันที่ช่วง [start − pad, end + pad] แตะ — เหตุการณ์ข้ามเที่ยงคืนต้องดึง gps_series ทั้งสองวัน */
export const windowDateKeys = (startMs: number, endMs: number, padMs: number) =>
  dateKeysBetween(thaiDateKey(startMs - padMs), thaiDateKey(endMs + padMs))

/** "2026-10-05" → "5 ต.ค." */
export const fmtDateKey = (dateKey: string) => fmtThaiDay(dayStartMs(dateKey))
