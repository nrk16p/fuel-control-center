import { summaryWithDefaults } from "@/lib/fuel-events"
import type { DailySummary, FuelEvent } from "@/lib/fuel-types"
import { fmtDateKey, fmtThaiTime } from "@/lib/thai-time"
import { CLASS_LABEL, SOURCE_LABEL } from "./labels"

type Props = {
  date: string | null
  summary: DailySummary | null
  checkFirst: FuelEvent[]
  loading: boolean
  onOpen: (id: string) => void
}

/** การ์ดเช้านี้ (spec §5.1) — ไม่แสดง ai_text */
export function MorningCard({ date, summary: raw, checkFirst, loading, onOpen }: Props) {
  if (!date || (loading && !raw)) {
    return <section className="h-[132px] animate-pulse rounded-[22px] border border-line bg-surface" aria-busy />
  }
  if (!raw) {
    return (
      <section className="rounded-[22px] border border-line bg-surface p-5 text-[14px] text-muted-ink">
        ยังไม่มีสรุปของวันที่ {fmtDateKey(date)} — งานคำนวณกลางคืนอาจยังไม่เสร็จ
      </section>
    )
  }
  // งานกลางคืนอาจเขียนสรุปไม่ครบ — ห้ามพังทั้งแท็บ
  const summary = summaryWithDefaults(raw)
  const noData = (summary.by_status.no_data ?? 0) + (summary.by_status.offline ?? 0)
  const stats: [string, string][] = [
    ["วิเคราะห์ได้", `${summary.trucks_analysed} คัน`],
    ["ไม่มีข้อมูล", `${noData} คัน`],
    ["พบเหตุการณ์", String(summary.events)],
    ["ปิดอัตโนมัติ", String(summary.auto_closed)],
    ["รอตรวจ", String(summary.open + summary.audit)],
    ["ลิตรที่น่าจะหาย", `~${Math.round(summary.likely_litres)} L`],
  ]
  return (
    <section className="rounded-[22px] border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold text-ink">เช้านี้ · {fmtDateKey(date)}</h2>
      {summary.sources_missing.length > 0 && (
        <p role="alert" className="mt-3 rounded-[12px] bg-clay/10 px-3 py-2 text-[14px] text-clay">
          ข้อมูลจาก {summary.sources_missing.map((s) => SOURCE_LABEL[s]).join(" / ")} ยังไม่เข้า — รถของผู้ให้บริการนี้ยังไม่ถูกวิเคราะห์
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-[14px] bg-cream px-3 py-2">
            <dt className="text-[12px] text-muted-ink">{label}</dt>
            <dd className="text-[18px] font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {checkFirst.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-muted-ink">ดูก่อน</h3>
          <ul className="mt-1 space-y-1">
            {checkFirst.map((e) => (
              <li key={e._id}>
                <button
                  type="button"
                  onClick={() => onOpen(e._id)}
                  className="text-left text-[14px] text-forest underline-offset-2 hover:underline"
                >
                  {e.plate} · {e.litres.toFixed(0)} L · {CLASS_LABEL[e.class]} · {fmtThaiTime(Date.parse(e.start))}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
