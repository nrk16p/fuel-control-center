"use client"

import { memo } from "react"
import { fmtThaiDateTime, fmtThaiDay, fmtThaiTime, type DetectOptions, type FuelEvent } from "@/lib/fuel-analysis"

export type DetectedCase = FuelEvent & {
  n: number
  reviewLabel: string | null // null = ยังไม่รีวิว
  reviewTone: "clay" | "muted"
  selected: boolean
}

interface Props {
  cases: DetectedCase[]
  opts: DetectOptions
  onOptsChange: (o: DetectOptions) => void
  onSelect: (c: DetectedCase) => void
}

function fmtRange(a: number, b: number) {
  return fmtThaiDay(a) === fmtThaiDay(b)
    ? `${fmtThaiDateTime(a)}–${fmtThaiTime(b)}`
    : `${fmtThaiDateTime(a)} → ${fmtThaiDateTime(b)}`
}

function fmtDuration(min: number) {
  if (min < 60) return `${min} นาที`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`
}

const inputClass =
  "h-9 w-16 rounded-[10px] border border-line-input bg-surface px-2 text-center text-[14px] text-ink outline-none focus-visible:border-forest focus-visible:ring-2 focus-visible:ring-forest/30"

function DetectedEventsListComponent({ cases, opts, onOptsChange, onSelect }: Props) {
  const pending = cases.filter((c) => c.reviewLabel == null).length

  const setNum = (key: "minDropL" | "maxWindowMin") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    if (Number.isFinite(v) && v > 0) onOptsChange({ ...opts, [key]: v })
  }

  return (
    <section className="space-y-3" aria-labelledby="detected-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="detected-heading" className="text-[20px] font-semibold text-ink">
            จุดน่าสงสัยที่ระบบพบ
          </h3>
          <p className="text-[13px] text-muted-ink">
            {cases.length} จุด · ยังไม่รีวิว {pending} · คลิกเพื่อดูบนกราฟและเปิดฟอร์มรีวิว
          </p>
        </div>

        {/* เกณฑ์ตรวจจับ */}
        <fieldset className="flex flex-wrap items-center gap-2 rounded-[14px] bg-mint px-3 py-2 text-[13px] text-forest-dark">
          <legend className="sr-only">เกณฑ์ตรวจจับอัตโนมัติ</legend>
          <label htmlFor="det-min">ลด ≥</label>
          <input id="det-min" type="number" min={1} step={1} value={opts.minDropL} onChange={setNum("minDropL")} className={inputClass} />
          <span>ลิตร</span>
          <label htmlFor="det-win">ภายใน ≤</label>
          <input id="det-win" type="number" min={5} step={5} value={opts.maxWindowMin} onChange={setNum("maxWindowMin")} className={inputClass} />
          <span>นาที</span>
          <label className="ml-1 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={opts.stationaryOnly}
              onChange={(e) => onOptsChange({ ...opts, stationaryOnly: e.target.checked })}
              className="h-4 w-4 accent-forest"
            />
            เฉพาะตอนจอด/ดับเครื่อง
          </label>
        </fieldset>
      </div>

      {cases.length === 0 ? (
        <p className="rounded-[18px] border border-line bg-surface px-4 py-6 text-center text-[14px] text-muted-ink">
          ไม่พบจุดที่น้ำมันลดเกินเกณฑ์ในช่วงนี้
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {cases.map((c) => (
            <li key={`${c.kind}-${c.startTs}`}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                aria-pressed={c.selected}
                className={`flex w-full items-start gap-3.5 rounded-[18px] bg-surface px-4 py-3.5 text-left shadow-[0_2px_0_var(--line)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-forest ${
                  c.selected ? "border-2 border-clay" : "border border-line hover:border-[#D6CDB6]"
                }`}
              >
                <span
                  className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full font-semibold text-surface ${
                    c.reviewTone === "clay" ? "bg-clay" : "bg-[#8C958F]"
                  }`}
                >
                  {c.n}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex justify-between gap-2">
                    <span className="text-[15px] font-semibold text-ink">{fmtRange(c.startTs, c.endTs)}</span>
                    <span className={`text-[17px] font-semibold ${c.reviewTone === "clay" ? "text-clay" : "text-muted-ink"}`}>
                      −{c.amount.toFixed(1)} ล.
                    </span>
                  </span>
                  <span className="text-[13px] text-muted-ink">
                    {fmtDuration(c.durationMin)} · {c.statusLabel}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[12px] ${
                        c.reviewLabel == null ? "bg-[#F6E1D6] text-[#8E4426]" : "bg-mint text-forest-dark"
                      }`}
                    >
                      {c.reviewLabel == null ? "ยังไม่รีวิว" : `รีวิวแล้ว · ${c.reviewLabel}`}
                    </span>
                    {c.kind === "gap_drop" && (
                      <span className="rounded-full bg-cream px-2.5 py-0.5 text-[12px] text-body">
                        ไม่มีข้อมูล GPS ระหว่างช่วง — ดูว่ารถดับเครื่องหรือสัญญาณหาย
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export const DetectedEventsList = memo(DetectedEventsListComponent)
