// ประเภทเหตุการณ์ → ป้ายภาษาไทย + โทนสี; ประเภทใหม่จาก Part 2 ที่หน้าเว็บยังไม่รู้จักต้องแสดงได้ ไม่ทำให้หน้าพัง
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { EventClass } from "./fuel-types"

export type Tone = "clay" | "butter" | "muted" | "forest"

export const CLASS_LABEL: Record<EventClass, string> = {
  suspected_loss: "น่าจะดูดน้ำมันจริง",
  gap_loss: "น้ำมันหายช่วงสัญญาณขาด",
  place_drop: "ลดที่แพลนท์/จุดจอด",
  noise: "สัญญาณรบกวน",
  consumption: "ใช้ตามปกติ",
  refuel: "เติมน้ำมัน",
  sensor_fault: "เซนเซอร์ผิดปกติ",
}

export const CLASS_TONE: Record<EventClass, Tone> = {
  suspected_loss: "clay",
  gap_loss: "clay",
  place_drop: "butter",
  sensor_fault: "butter",
  noise: "muted",
  consumption: "muted",
  refuel: "forest",
}

/** ป้ายของประเภท — ประเภทที่ยังไม่รู้จักแสดงชื่อดิบแทนการพัง */
export function classLabel(cls: string | null | undefined): string {
  if (!cls) return "ไม่ระบุประเภท"
  return Object.hasOwn(CLASS_LABEL, cls) ? CLASS_LABEL[cls as EventClass] : `ประเภทอื่น (${cls})`
}

export const classTone = (cls: string | null | undefined): Tone =>
  cls && Object.hasOwn(CLASS_TONE, cls) ? CLASS_TONE[cls as EventClass] : "muted"

const LOSS_CLASSES = new Set<string>(["suspected_loss", "gap_loss"])

/** สีแถบ/หมุดบนกราฟ: ยืนยันว่าดูดจริงเป็นสีแดงเสมอ; ประเภทที่น่าจะหายเป็นสีแดงจนกว่าจะตัดสินว่าไม่ใช่ */
export function eventTone(e: { class: string | null | undefined; decision: string | null | undefined }): "clay" | "muted" {
  if (e.decision === "real_loss") return "clay"
  if (e.decision === "noise" || e.decision === "legit") return "muted"
  return e.class && LOSS_CLASSES.has(e.class) ? "clay" : "muted"
}
