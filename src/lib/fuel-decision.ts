// การตัดสินเหตุการณ์ (spec §5.1, §5.3): ตรวจ payload, ปุ่มลัด, และเอกสารที่ลง fuel_drop_reviews
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { Decision, EventKind, EventStatus, Suggestion } from "./fuel-types"

export const DECISIONS: readonly Decision[] = ["real_loss", "noise", "legit", "follow_up"]
export const NOTE_MIN_REAL_LOSS = 5
export const NOTE_MAX = 1000

export type DecisionInput = { decision: Decision; note: string }

export function validateDecision(body: unknown): { ok: true; value: DecisionInput } | { ok: false; error: string } {
  const input = (body ?? {}) as { decision?: unknown; note?: unknown }
  if (typeof input.decision !== "string" || !(DECISIONS as readonly string[]).includes(input.decision)) {
    return { ok: false, error: "decision ต้องเป็น real_loss, noise, legit หรือ follow_up" }
  }
  const note = typeof input.note === "string" ? input.note.trim() : ""
  if (input.decision === "real_loss" && note.length < NOTE_MIN_REAL_LOSS) {
    return { ok: false, error: `ยืนยันดูดจริงต้องใส่โน้ตอย่างน้อย ${NOTE_MIN_REAL_LOSS} ตัวอักษร` }
  }
  if (note.length > NOTE_MAX) return { ok: false, error: `โน้ตยาวเกิน ${NOTE_MAX} ตัวอักษร` }
  return { ok: true, value: { decision: input.decision as Decision, note } }
}

/** fuel_drop_reviews.plate ใช้รูปแบบเดิม ("71-8623") ให้ /dashboard และหน้าเดิมจับกลุ่มรีวิวเก่า-ใหม่ด้วยกัน */
export function legacyPlate(plate: string): string {
  const match = /(\d{2})\s*[-–—]\s*(\d{4})/.exec(plate)
  return match ? `${match[1]}-${match[2]}` : plate.trim()
}

export type ReviewSource = {
  _id: string
  plate: string
  kind: EventKind
  litres: number
  start: string | Date
  end: string | Date
  features?: Record<string, unknown> | null
  suggestion: Suggestion
  scorer: string
  status: EventStatus
  audit?: boolean
  review_id: unknown
}

const round2 = (n: number) => Math.round(n * 100) / 100
const numberOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** เอกสารใหม่ใน fuel_drop_reviews — ฟิลด์เดิมครบ (start_ts, end_ts, fuel_start, fuel_end, fuel_diff, duration_min, decision, note, reviewer, revision_of, created_at)
 *  + event_id / suggestion / scorer / audit (spec §5.3) */
export function buildReviewDoc(args: { event: ReviewSource; input: DecisionInput; reviewer: string; now: Date }) {
  const { event, input, reviewer, now } = args
  const startTs = new Date(event.start).getTime()
  const endTs = new Date(event.end).getTime()
  const fuelStart = numberOrNull(event.features?.level_before)
  const fuelEnd = numberOrNull(event.features?.level_after)
  // fuel_diff ตามความหมายเดิม: ต้น − ปลาย (บวก = หาย, การเติมเป็นลบ)
  const fuelDiff =
    fuelStart != null && fuelEnd != null
      ? round2(fuelStart - fuelEnd)
      : round2(event.kind === "refuel" ? -event.litres : event.litres)
  return {
    plate: legacyPlate(event.plate),
    plate_norm: event.plate,
    event_id: event._id,
    start_ts: startTs,
    end_ts: endTs,
    fuel_start: fuelStart,
    fuel_end: fuelEnd,
    fuel_diff: fuelDiff,
    duration_min: Math.round((endTs - startTs) / 60_000),
    decision: input.decision,
    note: input.note,
    reviewer,
    suggestion: event.suggestion,
    scorer: event.scorer,
    // ตรวจสุ่ม: status ยังเป็น "audit" อยู่ หรือเคยตัดสินในฐานะตรวจสุ่มแล้ว (กรณีแก้คำตัดสิน)
    audit: event.status === "audit" || event.audit === true,
    revision_of: event.review_id ?? null,
    created_at: now,
  }
}

export type KeyAction =
  | { type: "decide"; decision: Decision }
  | { type: "next" }
  | { type: "prev" }
  | { type: "note" }
  | { type: "close" }

const DECISION_KEYS: Record<string, Decision> = { "1": "real_loss", "2": "noise", "3": "legit", "4": "follow_up" }

/** ปุ่มลัดในคิว: 1–4 ตัดสิน · J/K ถัดไป/ก่อนหน้า · N โน้ต · Esc ปิด — ไม่ทำงานระหว่างพิมพ์ในช่องข้อความ */
export function keyAction(key: string, inTextField: boolean): KeyAction | null {
  if (inTextField) return null
  if (Object.hasOwn(DECISION_KEYS, key)) return { type: "decide", decision: DECISION_KEYS[key] }
  switch (key.toLowerCase()) {
    case "j":
      return { type: "next" }
    case "k":
      return { type: "prev" }
    case "n":
      return { type: "note" }
    case "escape":
      return { type: "close" }
    default:
      return null
  }
}
