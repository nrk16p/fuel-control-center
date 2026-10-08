"use client"

import { EVENT_CLASSES, SOURCES, STATUS_FILTERS, isDefaultQueue, type StatusFilter } from "@/lib/fuel-events"
import type { EventClass, Source } from "@/lib/fuel-types"
import { SOURCE_LABEL, STATUS_FILTER_LABEL, classLabel } from "./labels"

export type QueueFilters = {
  from: string
  to: string
  status: StatusFilter
  cls: EventClass | ""
  source: Source | ""
  branch: string
  fleet: string
  plant: string
}

const field = "mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"
const label = "text-[12px] text-muted-ink"

type Props = { value: QueueFilters; onChange: (next: QueueFilters) => void }

export function EventFilters({ value, onChange }: Props) {
  const set = <K extends keyof QueueFilters>(key: K, next: QueueFilters[K]) => onChange({ ...value, [key]: next })
  // ชิป: ลดที่แพลนท์/จุดจอด ไม่ขึ้นในคิวปกติ — กดเพื่อดูเฉพาะประเภทนี้
  const placeDrops = value.cls === "place_drop"
  // ช่องข้อความใช้ค่าตอนออกจากช่อง/กด Enter — ไม่ยิง API ทุกตัวอักษร
  const textProps = (key: "branch" | "fleet" | "plant") => ({
    defaultValue: value[key],
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value.trim() !== value[key]) set(key, e.target.value.trim())
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur()
    },
    className: `${field} w-32`,
  })
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[22px] border border-line bg-surface p-4">
      <label className={label}>
        ตั้งแต่
        <input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} className={field} />
      </label>
      <label className={label}>
        ถึง
        <input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} className={field} />
      </label>
      <label className={label}>
        สถานะ
        <select value={value.status} onChange={(e) => set("status", e.target.value as StatusFilter)} className={field}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        ประเภท
        <select value={value.cls} onChange={(e) => set("cls", e.target.value as EventClass | "")} className={field}>
          <option value="">{isDefaultQueue(value) ? "ทุกประเภท (ยกเว้นที่แพลนท์/จุดจอด)" : "ทุกประเภท"}</option>
          {EVENT_CLASSES.map((c) => (
            <option key={c} value={c}>
              {classLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-pressed={placeDrops}
        onClick={() => set("cls", placeDrops ? "" : "place_drop")}
        className={`h-9 rounded-full border px-3 text-[13px] ${placeDrops ? "border-forest bg-mint font-semibold text-forest" : "border-line-input bg-surface text-ink"}`}
      >
        ที่แพลนท์/จุดจอด
      </button>
      <label className={label}>
        แหล่ง GPS
        <select value={value.source} onChange={(e) => set("source", e.target.value as Source | "")} className={field}>
          <option value="">ทุกแหล่ง</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        สาขา
        <input placeholder="เช่น ลาดกระบัง" {...textProps("branch")} />
      </label>
      <label className={label}>
        ฟลีท
        <input placeholder="เช่น Asia" {...textProps("fleet")} />
      </label>
      <label className={label}>
        แพลนท์
        <input placeholder="ชื่อแพลนท์" {...textProps("plant")} />
      </label>
    </div>
  )
}
