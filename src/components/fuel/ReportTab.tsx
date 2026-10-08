"use client"

import { useState } from "react"
import { exportToExcel } from "@/lib/exportToExcel"
import type { Report, ReportRow } from "@/lib/fuel-report"
import type { CoverageRow, FuelSettings } from "@/lib/fuel-types"
import { fmtDateKey } from "@/lib/thai-time"
import { DataStatusTable } from "./DataStatusTable"
import { SettingsForm } from "./SettingsForm"
import { useJson } from "./useJson"

type ReportResponse = { from: string; to: string; settings: FuelSettings; report: Report; rows: Record<string, string | number | null>[] }
type CoverageResponse = { date: string; rows: CoverageRow[] }
type SettingsResponse = { settings: FuelSettings; updated_at: string | null; updated_by?: string | null }

const field = "mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"

function RankTable({ title, rows }: { title: string; rows: ReportRow[] }) {
  return (
    <div className="rounded-[18px] border border-line bg-surface p-3">
      <h4 className="text-[13px] font-semibold text-ink">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted-ink">ยังไม่มี</p>
      ) : (
        <table className="mt-1 w-full text-[13px]">
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="py-1 pr-2 text-ink">{r.key}</td>
                <td className="py-1 pr-2 text-right text-body">{r.events} ครั้ง</td>
                <td className="py-1 pr-2 text-right text-body">{r.litres.toFixed(1)} L</td>
                <td className="py-1 text-right text-body">{r.baht == null ? "–" : `${r.baht.toLocaleString("th-TH")} ฿`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** สรุป & สถานะข้อมูล (spec §5.1 แท็บที่ 3) */
export function ReportTab() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [coverageDate, setCoverageDate] = useState("")

  const qs = new URLSearchParams()
  if (from) qs.set("from", from)
  if (to) qs.set("to", to)
  const report = useJson<ReportResponse>(qs.toString() ? `/api/fuel/report?${qs.toString()}` : "/api/fuel/report")
  const coverage = useJson<CoverageResponse>(coverageDate ? `/api/fuel/coverage?date=${coverageDate}` : "/api/fuel/coverage")
  const settings = useJson<SettingsResponse>("/api/fuel/settings")

  const r = report.data?.report
  const price = report.data?.settings.price_per_litre ?? null
  const weekMax = Math.max(1, ...(r?.byWeek ?? []).map((w) => w.litres))

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-ink">น้ำมันที่ยืนยันว่าหาย</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] text-muted-ink">
              ตั้งแต่
              <input type="date" value={from || report.data?.from || ""} onChange={(e) => setFrom(e.target.value)} className={field} />
            </label>
            <label className="text-[12px] text-muted-ink">
              ถึง
              <input type="date" value={to || report.data?.to || ""} onChange={(e) => setTo(e.target.value)} className={field} />
            </label>
            <button
              type="button"
              disabled={!report.data?.rows.length}
              onClick={() => report.data && exportToExcel(report.data.rows, `fuel-losses-${report.data.from}-${report.data.to}.xlsx`)}
              className="h-9 rounded-[12px] border border-line-input bg-surface px-3 text-[13px] text-forest disabled:opacity-40"
            >
              ส่งออก Excel
            </button>
          </div>
        </div>
        {report.error && (
          <p role="alert" className="text-[14px] text-clay">
            {report.error}
          </p>
        )}
        {!r ? (
          <div className="h-24 animate-pulse rounded-[14px] bg-line" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">ยืนยันดูดจริง</dt>
                <dd className="text-[18px] font-semibold text-ink">{r.confirmed.events} ครั้ง</dd>
              </div>
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">ปริมาณ</dt>
                <dd className="text-[18px] font-semibold text-ink">{r.confirmed.litres.toFixed(1)} L</dd>
              </div>
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">มูลค่า{price != null ? ` (≈ ${price} ฿/L)` : ""}</dt>
                <dd className="text-[18px] font-semibold text-ink">
                  {r.confirmed.baht == null ? (
                    <span className="text-[13px] font-normal text-muted-ink">ยังไม่ได้ตั้งราคาน้ำมัน (ด้านล่าง)</span>
                  ) : (
                    `${r.confirmed.baht.toLocaleString("th-TH")} ฿`
                  )}
                </dd>
              </div>
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">ทีมเห็นด้วยกับคำแนะนำ</dt>
                <dd className="text-[18px] font-semibold text-ink">
                  {r.acceptance.rate == null ? "–" : `${Math.round(r.acceptance.rate * 100)}%`}
                  <span className="ml-1 text-[12px] font-normal text-muted-ink">
                    ({r.acceptance.agreed}/{r.acceptance.decided})
                  </span>
                </dd>
              </div>
            </dl>
            <p className="text-[13px] text-body">
              ตรวจสุ่มจากที่ปิดอัตโนมัติ: {r.audit.checked} รายการ — ดูดจริง {r.audit.realLoss} · สัญญาณรบกวน {r.audit.noise} · ปกติ {r.audit.legit} ·
              ติดตาม {r.audit.followUp}
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              <RankTable title="ตามรถ" rows={r.byTruck} />
              <RankTable title="ตามคนขับ" rows={r.byDriver} />
              <RankTable title="ตามแพลนท์" rows={r.byPlant} />
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-ink">รายสัปดาห์</h4>
              {r.byWeek.length === 0 ? (
                <p className="text-[13px] text-muted-ink">ยังไม่มี</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {r.byWeek.map((w) => (
                    <li key={w.week} className="flex items-center gap-2 text-[13px]">
                      <span className="w-28 shrink-0 text-muted-ink">สัปดาห์ {fmtDateKey(w.week)}</span>
                      <span className="h-3 rounded-full bg-clay/70" style={{ width: `${(w.litres / weekMax) * 60}%` }} aria-hidden />
                      <span className="text-body">
                        {w.litres.toFixed(1)} L · {w.events} ครั้ง
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      <DataStatusTable
        date={coverageDate || coverage.data?.date || ""}
        rows={coverage.data?.rows ?? []}
        loading={coverage.loading}
        onDateChange={setCoverageDate}
      />

      {settings.data && (
        <SettingsForm
          key={settings.data.updated_at ?? "default"}
          initial={settings.data.settings}
          updatedAt={settings.data.updated_at}
          updatedBy={settings.data.updated_by ?? null}
          onSaved={settings.reload}
        />
      )}
    </div>
  )
}
