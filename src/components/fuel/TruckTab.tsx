"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { CoverageVerdict, LastSeen, SourceSeries } from "@/lib/fuel-series"
import type { CoverageRow, FuelEvent, Source } from "@/lib/fuel-types"
import { fmtThaiDateTime } from "@/lib/thai-time"
import { DECISION_LABEL, SOURCE_LABEL, classLabel } from "./labels"
import { NoDataBanner } from "./NoDataBanner"
import { SeriesChart } from "./SeriesChart"
import { useJson } from "./useJson"

type SeriesResponse = {
  plate: string
  from: string
  to: string
  series: SourceSeries[]
  verdict: CoverageVerdict
  lastSeen: LastSeen | null
  events: FuelEvent[]
}
type CoverageResponse = { date: string; rows: CoverageRow[] }

const field = "mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"
const label = "text-[12px] text-muted-ink"

/** รายคัน: กราฟ gps_series ของทุกแหล่งในช่วงที่เลือก + เหตุผลเมื่อไม่มีข้อมูล (spec §5.1) */
export function TruckTab() {
  const params = useSearchParams()
  const router = useRouter()
  const [plate, setPlate] = useState(() => params.get("plate")?.trim() ?? "")
  const [draft, setDraft] = useState(plate)
  const [from, setFrom] = useState(() => params.get("from") ?? "")
  const [to, setTo] = useState(() => params.get("to") ?? "")
  const [source, setSource] = useState<Source | "">("")

  const coverage = useJson<CoverageResponse>("/api/fuel/coverage")
  const query = new URLSearchParams({ plate })
  if (from) query.set("from", from)
  if (to) query.set("to", to)
  const data = useJson<SeriesResponse>(plate ? `/api/fuel/series?${query.toString()}` : null)

  const plates = [...new Set((coverage.data?.rows ?? []).map((r) => r.plate))].sort((a, b) => a.localeCompare(b))
  const series = (data.data?.series ?? []).filter((s) => !source || s.source === source)
  const shownFrom = from || data.data?.from || ""
  const shownTo = to || data.data?.to || ""

  function openInQueue(e: FuelEvent) {
    const qs = new URLSearchParams({ tab: "queue", event: e._id, from: e.date_key, to: e.date_key, status: "all" })
    router.push(`/fueldetection?${qs.toString()}`)
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-[22px] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault()
          setPlate(draft.trim())
        }}
      >
        <label className={label}>
          ทะเบียน
          <input
            list="fuel-plates"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="เช่น สบ.71-8635"
            className={`${field} w-44`}
          />
          <datalist id="fuel-plates">
            {plates.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          ตั้งแต่
          <input type="date" value={shownFrom} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className={label}>
          ถึง
          <input type="date" value={shownTo} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
        <label className={label}>
          แหล่ง GPS
          <select value={source} onChange={(e) => setSource(e.target.value as Source | "")} className={field}>
            <option value="">ทุกแหล่ง</option>
            <option value="besttech">{SOURCE_LABEL.besttech}</option>
            <option value="terminus">{SOURCE_LABEL.terminus}</option>
          </select>
        </label>
        <button type="submit" className="h-9 rounded-[12px] bg-forest px-4 text-[13px] font-semibold text-cream">
          ดูกราฟ
        </button>
      </form>

      {!plate && <p className="text-[14px] text-muted-ink">เลือกหรือพิมพ์ทะเบียนเพื่อดูกราฟ (ช่วงเริ่มต้น 3 วันล่าสุด)</p>}
      {data.error && (
        <p role="alert" className="text-[14px] text-clay">
          {data.error}
        </p>
      )}
      {data.loading && <div className="h-[420px] animate-pulse rounded-[22px] bg-line" />}
      {data.data && !data.loading && (
        <>
          {data.data.plate !== plate && (
            <p className="text-[13px] text-muted-ink">
              พบข้อมูลในชื่อ <span className="font-semibold text-ink">{data.data.plate}</span> (ค้นด้วย {plate})
            </p>
          )}
          <NoDataBanner verdict={data.data.verdict} lastSeen={data.data.lastSeen} />
          {series.map((s) => (
            <SeriesChart key={s.source} series={s} events={data.data?.events ?? []} height={440} title={`${data.data?.plate} · ${SOURCE_LABEL[s.source]}`} />
          ))}
          <section className="rounded-[22px] border border-line bg-surface p-4">
            <h3 className="text-[14px] font-semibold text-ink">เหตุการณ์ในช่วงนี้</h3>
            {data.data.events.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted-ink">ไม่มีเหตุการณ์</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {data.data.events.map((e) => (
                  <li key={e._id}>
                    <button type="button" onClick={() => openInQueue(e)} className="text-left text-[13px] text-forest underline-offset-2 hover:underline">
                      {fmtThaiDateTime(Date.parse(e.start))} · {classLabel(e.class)} · {e.litres.toFixed(1)} L
                      {e.decision ? ` · ${DECISION_LABEL[e.decision]}` : " · รอตรวจ"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
