"use client"

import type { RefObject } from "react"
import { DECISIONS, NOTE_MIN_REAL_LOSS } from "@/lib/fuel-decision"
import type { Decision, Suggestion } from "@/lib/fuel-types"
import { DECISION_HINT, DECISION_LABEL } from "./labels"

type Props = {
  suggestion: Suggestion
  current: Decision | null
  pendingLoss: boolean
  note: string
  saving: boolean
  error: string | null
  noteRef: RefObject<HTMLTextAreaElement | null>
  onChoose: (decision: Decision) => void
  onNoteChange: (note: string) => void
  onSaveLoss: () => void
}

/** ปุ่ม 4 แบบ: ปกติ/รบกวน/ติดตาม บันทึกทันที · ดูดจริงต้องใส่โน้ตก่อน (spec §5.1) */
export function DecisionBar({ suggestion, current, pendingLoss, note, saving, error, noteRef, onChoose, onNoteChange, onSaveLoss }: Props) {
  const lossReady = note.trim().length >= NOTE_MIN_REAL_LOSS
  return (
    <section aria-label="ตัดสินเหตุการณ์" className="rounded-[22px] border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d, i) => {
          const active = current === d || (d === "real_loss" && pendingLoss)
          const suggested = d === suggestion
          return (
            <button
              key={d}
              type="button"
              disabled={saving}
              onClick={() => onChoose(d)}
              title={DECISION_HINT[d]}
              className={`h-10 rounded-[12px] border px-3 text-[14px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-forest disabled:opacity-50 ${
                active ? "border-forest bg-forest text-cream" : "border-line-input bg-surface text-ink hover:bg-cream"
              } ${suggested ? "ring-2 ring-clay/60" : ""}`}
            >
              <span className="mr-1 text-[12px] opacity-70">{i + 1}</span>
              {DECISION_LABEL[d]}
              {suggested && <span className="ml-1 text-[11px]">· แนะนำ</span>}
            </button>
          )
        })}
      </div>
      <label htmlFor="fuel-decision-note" className="mt-3 block text-[13px] text-muted-ink">
        โน้ต {pendingLoss ? `(จำเป็น อย่างน้อย ${NOTE_MIN_REAL_LOSS} ตัวอักษร)` : "(ไม่บังคับ)"}
      </label>
      <textarea
        id="fuel-decision-note"
        ref={noteRef}
        value={note}
        rows={2}
        onChange={(e) => onNoteChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && pendingLoss && lossReady) {
            e.preventDefault()
            onSaveLoss()
          }
        }}
        placeholder="เช่น เทียบใบเติมแล้วไม่ตรง / โทรถามคนขับแล้ว"
        className="mt-1 w-full rounded-[12px] border border-line-input bg-surface p-2 text-[14px] text-ink"
      />
      {pendingLoss && (
        <button
          type="button"
          disabled={!lossReady || saving}
          onClick={onSaveLoss}
          className="mt-2 h-10 rounded-[12px] bg-clay px-4 text-[14px] font-semibold text-cream disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกว่าดูดจริง (Ctrl+Enter)"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-clay">
          {error}
        </p>
      )}
      <p className="mt-2 text-[12px] text-muted-ink">ปุ่มลัด: 1–4 ตัดสิน · J/K ถัดไป/ก่อนหน้า · N ไปที่โน้ต · Esc ปิด</p>
    </section>
  )
}
