import type { FuelEvent } from "@/lib/fuel-types"
import { fmtThaiDateTime } from "@/lib/thai-time"
import { CLASS_LABEL, CLASS_TONE, DECISION_LABEL, TONE_CLASS } from "./labels"

type Props = { event: FuelEvent; selected: boolean; onSelect: () => void }

export function EventCard({ event, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-[18px] border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-forest ${
        selected ? "border-forest bg-mint/40" : "border-line bg-surface hover:bg-cream"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{event.plate}</span>
        <span className={`rounded-full px-2 py-0.5 text-[12px] ${TONE_CLASS[CLASS_TONE[event.class]]}`}>{CLASS_LABEL[event.class]}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-body">
        <span className="font-medium">{event.litres.toFixed(1)} L</span>
        <span>{Math.round(event.p_real_loss * 100)}%</span>
        <span>{fmtThaiDateTime(Date.parse(event.start))}</span>
        {event.driver && <span>{event.driver}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-ink">
        <span>
          แนะนำ: {DECISION_LABEL[event.suggestion]} · ความมั่นใจ {Math.round(event.confidence * 100)}%
        </span>
        {event.status === "audit" && <span className="rounded-full bg-butter/40 px-2 text-ink">ตรวจสุ่ม</span>}
        {event.decision && <span className="rounded-full bg-line px-2 text-ink">ตัดสิน: {DECISION_LABEL[event.decision]}</span>}
        {event.stale && <span className="rounded-full bg-line px-2 text-ink">รอบล่าสุดไม่พบแล้ว</span>}
      </div>
    </button>
  )
}
