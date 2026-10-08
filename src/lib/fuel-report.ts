// สรุปความเสียหายที่ยืนยันแล้ว + อัตราที่ทีมเห็นด้วยกับคำแนะนำ + ผลตรวจสุ่ม (spec §5.1 แท็บที่ 3)
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { FuelEvent } from "./fuel-types"

export type ReportEvent = Pick<FuelEvent, "plate" | "driver" | "plant" | "date_key" | "litres" | "decision" | "suggestion" | "audit">
export type ReportRow = { key: string; events: number; litres: number; baht: number | null }
export type Report = {
  confirmed: { events: number; litres: number; baht: number | null }
  byTruck: ReportRow[]
  byDriver: ReportRow[]
  byPlant: ReportRow[]
  byWeek: { week: string; events: number; litres: number }[]
  acceptance: { decided: number; agreed: number; rate: number | null }
  audit: { checked: number; realLoss: number; noise: number; legit: number; followUp: number }
}

export const UNKNOWN_DRIVER = "ไม่ทราบคนขับ"
export const UNKNOWN_PLANT = "ไม่ระบุแพลนท์"
const round1 = (n: number) => Math.round(n * 10) / 10
/** null = ยังไม่ได้ตั้งราคาน้ำมัน (รายงานแสดงแค่ลิตร) */
const toBaht = (litres: number, price: number | null) => (price == null ? null : Math.round(litres * price))

function groupLosses(losses: ReportEvent[], keyOf: (e: ReportEvent) => string, price: number | null): ReportRow[] {
  const rows = new Map<string, ReportRow>()
  for (const e of losses) {
    const key = keyOf(e)
    const row = rows.get(key) ?? { key, events: 0, litres: 0, baht: 0 }
    row.events += 1
    row.litres = round1(row.litres + e.litres)
    row.baht = toBaht(row.litres, price)
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.litres - a.litres || a.key.localeCompare(b.key))
}

/** วันจันทร์ของสัปดาห์ที่ date_key อยู่ */
export function weekStart(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function buildReport(events: ReportEvent[], pricePerLitre: number | null): Report {
  const losses = events.filter((e) => e.decision === "real_loss")
  const litres = round1(losses.reduce((sum, e) => sum + e.litres, 0))
  const weeks = new Map<string, { week: string; events: number; litres: number }>()
  for (const e of losses) {
    const week = weekStart(e.date_key)
    const row = weeks.get(week) ?? { week, events: 0, litres: 0 }
    row.events += 1
    row.litres = round1(row.litres + e.litres)
    weeks.set(week, row)
  }
  const judged = events.filter((e) => e.decision != null && e.decision !== "follow_up")
  const agreed = judged.filter((e) => e.decision === e.suggestion).length
  const audited = events.filter((e) => e.audit && e.decision != null)
  const count = (decision: string) => audited.filter((e) => e.decision === decision).length
  return {
    confirmed: { events: losses.length, litres, baht: toBaht(litres, pricePerLitre) },
    byTruck: groupLosses(losses, (e) => e.plate, pricePerLitre),
    byDriver: groupLosses(losses, (e) => e.driver || UNKNOWN_DRIVER, pricePerLitre),
    byPlant: groupLosses(losses, (e) => e.plant || UNKNOWN_PLANT, pricePerLitre),
    byWeek: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    acceptance: { decided: judged.length, agreed, rate: judged.length ? agreed / judged.length : null },
    audit: {
      checked: audited.length,
      realLoss: count("real_loss"),
      noise: count("noise"),
      legit: count("legit"),
      followUp: count("follow_up"),
    },
  }
}

/** แถวสำหรับ Excel: หนึ่งแถวต่อเหตุการณ์ที่ยืนยันว่าดูดจริง */
export function confirmedRows(events: ReportEvent[], pricePerLitre: number | null) {
  return events
    .filter((e) => e.decision === "real_loss")
    .sort((a, b) => a.date_key.localeCompare(b.date_key) || a.plate.localeCompare(b.plate))
    .map((e) => ({
      วันที่: e.date_key,
      ทะเบียน: e.plate,
      คนขับ: e.driver || UNKNOWN_DRIVER,
      แพลนท์: e.plant || UNKNOWN_PLANT,
      ลิตร: round1(e.litres),
      บาท: toBaht(e.litres, pricePerLitre),
    }))
}
