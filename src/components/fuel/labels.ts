import type { StatusFilter } from "@/lib/fuel-events"
import type { CoverageStatus, Decision, EventClass, Source } from "@/lib/fuel-types"

export const DECISION_LABEL: Record<Decision, string> = {
  real_loss: "ดูดจริง",
  noise: "สัญญาณรบกวน",
  legit: "ปกติ",
  follow_up: "ติดตาม",
}

export const DECISION_HINT: Record<Decision, string> = {
  real_loss: "ยืนยันว่าน้ำมันหายจริง (ต้องใส่โน้ต)",
  noise: "เซนเซอร์กระฉอก/กระโดด ไม่ได้หายจริง",
  legit: "เติม ใช้ตามปกติ หรือถ่ายเพื่อซ่อม",
  follow_up: "ยังสรุปไม่ได้ ต้องตามต่อ",
}

export const CLASS_LABEL: Record<EventClass, string> = {
  suspected_loss: "น่าจะดูดน้ำมันจริง",
  gap_loss: "น้ำมันหายช่วงสัญญาณขาด",
  noise: "สัญญาณรบกวน",
  consumption: "ใช้ตามปกติ",
  refuel: "เติมน้ำมัน",
  sensor_fault: "เซนเซอร์ผิดปกติ",
}

export type Tone = "clay" | "butter" | "muted" | "forest"
export const CLASS_TONE: Record<EventClass, Tone> = {
  suspected_loss: "clay",
  gap_loss: "clay",
  sensor_fault: "butter",
  noise: "muted",
  consumption: "muted",
  refuel: "forest",
}
export const TONE_CLASS: Record<Tone, string> = {
  clay: "bg-clay/10 text-clay",
  butter: "bg-butter/40 text-ink",
  muted: "bg-line text-muted-ink",
  forest: "bg-mint text-forest-dark",
}

export const SOURCE_LABEL: Record<Source, string> = { besttech: "Besttech", terminus: "Terminus" }

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  ok: "ปกติ",
  stuck: "ค่าน้ำมันค้าง",
  no_sensor: "ไม่มีเซนเซอร์น้ำมัน",
  offline: "กล่องออฟไลน์",
  no_data: "ไม่มีข้อมูล",
}

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  waiting: "รอตรวจ",
  decided: "ตัดสินแล้ว",
  auto_closed: "ปิดอัตโนมัติ",
  audit: "ตรวจสุ่ม",
  all: "ทั้งหมด",
}
