"use client"

import { useState } from "react"
import type { FuelSettings } from "@/lib/fuel-types"

type Props = { initial: FuelSettings; updatedAt: string | null; updatedBy: string | null; onSaved: () => void }

const FIELDS: { key: keyof FuelSettings; label: string; hint: string; step: string }[] = [
  { key: "auto_close_conf", label: "ความมั่นใจขั้นต่ำที่ปิดอัตโนมัติ", hint: "0.8–0.999 (ค่าเริ่ม 0.95)", step: "0.001" },
  { key: "audit_rate", label: "สัดส่วนตรวจสุ่มจากที่ปิดอัตโนมัติ", hint: "0–0.5 (ค่าเริ่ม 0.05 = 1 ใน 20)", step: "0.01" },
  { key: "price_per_litre", label: "ราคาน้ำมันต่อลิตร (บาท)", hint: "เว้นว่าง = ยังไม่ตั้ง (รายงานแสดงแค่ลิตร)", step: "0.01" },
]

/** ค่าที่ทีมปรับได้ (spec §4.6) — PUT /api/fuel/settings ต้องเข้าสู่ระบบ */
export function SettingsForm({ initial, updatedAt, updatedBy, onSaved }: Props) {
  const [values, setValues] = useState<Record<keyof FuelSettings, string>>({
    auto_close_conf: String(initial.auto_close_conf),
    audit_rate: String(initial.audit_rate),
    price_per_litre: initial.price_per_litre == null ? "" : String(initial.price_per_litre),
  })
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/fuel/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const body: unknown = await res.json().catch(() => null)
      const record = (body && typeof body === "object" ? body : {}) as { error?: unknown; saved?: unknown }
      if (!res.ok) {
        throw new Error(res.status === 401 ? "ต้องเข้าสู่ระบบใหม่ก่อนบันทึก" : String(record.error ?? `บันทึกไม่สำเร็จ (${res.status})`))
      }
      if (record.saved) {
        setMessage("บันทึกแล้ว — ใช้ในรอบคำนวณคืนนี้")
        onSaved()
      } else {
        setMessage("โหมดตัวอย่าง: ไม่ได้บันทึกลงฐานข้อมูล")
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
      <h3 className="text-[15px] font-semibold text-ink">ตั้งค่า</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-[13px] text-ink">
            {f.label}
            <input
              type="number"
              step={f.step}
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="mt-1 block h-9 w-full rounded-[12px] border border-line-input bg-surface px-2 text-[13px]"
            />
            <span className="text-[12px] text-muted-ink">{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="h-9 rounded-[12px] bg-forest px-4 text-[13px] font-semibold text-cream disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        {message && <span className="text-[13px] text-body">{message}</span>}
        {updatedBy && (
          <span className="text-[12px] text-muted-ink">
            แก้ล่าสุดโดย {updatedBy}
            {updatedAt ? ` · ${new Date(updatedAt).toLocaleString("th-TH")}` : ""}
          </span>
        )}
      </div>
    </section>
  )
}
