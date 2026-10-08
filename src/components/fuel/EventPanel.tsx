"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { eventPath, evidenceRows } from "@/lib/fuel-events"
import { pointNear, type SourceSeries } from "@/lib/fuel-series"
import type { FuelEvent, Source } from "@/lib/fuel-types"
import { fmtDateKey, fmtThaiDateTime, fmtThaiTime } from "@/lib/thai-time"
import { EventMapLoader } from "./EventMapLoader"
import { DECISION_LABEL, SOURCE_LABEL, classLabel } from "./labels"
import { SeriesChart } from "./SeriesChart"
import { useJson } from "./useJson"

type Detail = { event: FuelEvent; series: SourceSeries[]; history: FuelEvent[] }
type Props = { eventId: string; onClose: () => void; children: ReactNode }

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section aria-label="รายละเอียดเหตุการณ์" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="h-9 shrink-0 rounded-[12px] border border-line-input bg-surface px-3 text-[13px] text-muted-ink"
        >
          ปิด (Esc)
        </button>
      </div>
      {children}
    </section>
  )
}

/** แผงรายละเอียด: กราฟ ±3 ชม., หลักฐาน, แผนที่, ประวัติ 30 วัน, ปุ่มตัดสิน (children) */
export function EventPanel({ eventId, onClose, children }: Props) {
  const { data, error } = useJson<Detail>(eventPath(eventId))
  const [source, setSource] = useState<Source | null>(null)

  if (error) {
    return (
      <PanelShell title="เหตุการณ์" onClose={onClose}>
        <p role="alert" className="text-[14px] text-clay">
          {error}
        </p>
      </PanelShell>
    )
  }
  if (!data) {
    return (
      <PanelShell title="กำลังโหลด…" onClose={onClose}>
        <div className="h-[320px] animate-pulse rounded-[22px] bg-line" />
      </PanelShell>
    )
  }

  const { event, series, history } = data
  const shown = series.find((s) => s.source === (source ?? event.sources[0])) ?? series[0] ?? null
  const startMs = Date.parse(event.start)
  const point =
    event.place?.lat != null && event.place?.lng != null
      ? { lat: event.place.lat, lng: event.place.lng }
      : pointNear(series, startMs)
  const code = event.truck_code && event.truck_code !== event.plate ? ` (${event.truck_code})` : ""

  return (
    <PanelShell title={`${event.plate}${code} · ${classLabel(event.class)}`} onClose={onClose}>
      <p className="text-[14px] text-body">
        {fmtThaiDateTime(startMs)} – {fmtThaiTime(Date.parse(event.end))} · {event.litres.toFixed(1)} L
        {event.driver ? ` · คนขับ ${event.driver}` : " · ไม่ทราบคนขับ"} · จาก {event.sources.map((s) => SOURCE_LABEL[s]).join(" + ")}
      </p>

      {series.length > 1 && (
        <div className="flex gap-2" role="group" aria-label="เลือกแหล่ง GPS">
          {series.map((s) => (
            <button
              key={s.source}
              type="button"
              aria-pressed={shown?.source === s.source}
              onClick={() => setSource(s.source)}
              className={`h-9 rounded-[12px] border border-line-input px-3 text-[13px] ${
                shown?.source === s.source ? "bg-mint text-forest-dark" : "bg-surface text-muted-ink"
              }`}
            >
              {SOURCE_LABEL[s.source]}
            </button>
          ))}
        </div>
      )}

      {shown ? (
        <SeriesChart series={shown} events={[event]} selectedId={event._id} height={320} title="ระดับน้ำมันรอบเหตุการณ์ (±3 ชม.)" />
      ) : (
        <p className="rounded-[18px] border border-line bg-surface p-4 text-[14px] text-muted-ink">ไม่มีข้อมูล GPS ช่วงนี้</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
          <h3 className="text-[14px] font-semibold text-ink">หลักฐาน</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            {evidenceRows(event).map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-ink">{row.label}</dt>
                <dd className="text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
          {event.reasons.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-body">
              {event.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {event.action && <p className="rounded-[12px] bg-butter/40 px-3 py-2 text-[13px] text-ink">แนะนำให้: {event.action}</p>}
        </div>
        <div className="h-64 md:h-auto md:min-h-64">
          <EventMapLoader point={point} />
        </div>
      </div>

      {children}

      <div className="rounded-[22px] border border-line bg-surface p-4">
        <h3 className="text-[14px] font-semibold text-ink">เหตุการณ์อื่นของคันนี้ (30 วัน)</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted-ink">ไม่มีเหตุการณ์อื่น</p>
        ) : (
          <ul className="mt-1 space-y-1 text-[13px] text-body">
            {history.map((h) => (
              <li key={h._id}>
                {fmtDateKey(h.date_key)} {fmtThaiTime(Date.parse(h.start))} · {classLabel(h.class)} · {h.litres.toFixed(1)} L
                {h.decision ? ` · ${DECISION_LABEL[h.decision]}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  )
}
