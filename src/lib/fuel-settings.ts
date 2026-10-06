// ค่าที่ทีมปรับได้ในแท็บสรุป (spec §4.6): ความมั่นใจขั้นต่ำที่ปิดอัตโนมัติ, สัดส่วนตรวจสุ่ม, ราคาน้ำมันต่อลิตร
// เอกสารเดียวใน analytics.fuel_settings (_id "default") — Part 2 อาจเก็บค่าอื่นในเอกสารเดียวกัน ห้ามเขียนทับ
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { FuelSettings } from "./fuel-types"

export const SETTINGS_ID = "default"
export type SettingsDoc = { _id: string; updated_at?: Date; updated_by?: string } & Partial<FuelSettings>

export const DEFAULT_SETTINGS: FuelSettings = { auto_close_conf: 0.95, audit_rate: 0.05, price_per_litre: null }

const KEYS = ["auto_close_conf", "audit_rate", "price_per_litre"] as const
const LIMITS: Record<keyof FuelSettings, [number, number]> = {
  auto_close_conf: [0.8, 0.999],
  audit_rate: [0, 0.5],
  price_per_litre: [1, 200],
}
const LABELS: Record<keyof FuelSettings, string> = {
  auto_close_conf: "ความมั่นใจขั้นต่ำที่ปิดอัตโนมัติ",
  audit_rate: "สัดส่วนตรวจสุ่ม",
  price_per_litre: "ราคาน้ำมันต่อลิตร",
}

export function withDefaults(doc: Record<string, unknown> | null | undefined): FuelSettings {
  const out = { ...DEFAULT_SETTINGS }
  for (const key of KEYS) {
    const value = doc?.[key]
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value
  }
  return out
}

export type SettingsPayload = { settings: FuelSettings; updated_at: Date | null; updated_by?: string | null }

/** คำตอบของ GET /api/fuel/settings — /api เปิดสาธารณะ จึงบอกอีเมลผู้แก้ล่าสุดเฉพาะคนที่ล็อกอินแล้ว */
export function settingsPayload(doc: SettingsDoc | null, signedIn: boolean): SettingsPayload {
  const payload: SettingsPayload = { settings: withDefaults(doc), updated_at: doc?.updated_at ?? null }
  if (signedIn) payload.updated_by = doc?.updated_by ?? null
  return payload
}

export function validateSettings(body: unknown): { ok: true; value: FuelSettings } | { ok: false; error: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const value: FuelSettings = { ...DEFAULT_SETTINGS }
  for (const key of KEYS) {
    const raw = input[key]
    // ราคาเว้นว่างได้ = ยังไม่ตั้ง (รายงานแสดงแค่ลิตร)
    if (key === "price_per_litre" && (raw === null || raw === undefined || raw === "")) {
      value.price_per_litre = null
      continue
    }
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN
    const [min, max] = LIMITS[key]
    if (!Number.isFinite(n) || n < min || n > max) return { ok: false, error: `${LABELS[key]} ต้องอยู่ระหว่าง ${min}–${max}` }
    value[key] = n
  }
  return { ok: true, value }
}
