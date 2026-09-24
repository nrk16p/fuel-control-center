"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Tone = "forest" | "clay" | "ink"

type StatState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; value: string; tone?: Tone; label?: string; hint?: string }

const TONE_CLASS: Record<Tone, string> = {
  forest: "text-forest",
  clay: "text-clay",
  ink: "text-ink",
}

const LOADING: StatState = { status: "loading" }

/* ---------- helpers ---------- */

const pad = (n: number) => String(n).padStart(2, "0")

// YYYY-MM-DD ตามเวลาเครื่อง (ตรงกับที่ตาราง Engine-On แสดง)
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const errMsg = (e: unknown) => `โหลดข้อมูลไม่สำเร็จ (${e instanceof Error ? e.message : String(e)})`

/* ---------- 1) เคสน้ำมันน่าสงสัยเดือนนี้ ---------- */

type ReviewRow = { _id: unknown; decision?: string; revision_of?: unknown }

async function loadSuspicious(): Promise<StatState> {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  // ขอบเดือนตามเวลาไทย (UTC+7) — แบบเดียวกับหน้า Fuel Detection
  const startTs = Date.UTC(y, m, 1, -7)
  const endTs = Date.UTC(y, m + 1, 1, -7) - 1

  const rows = await getJson<ReviewRow[]>(`/api/fuel-reviews?startTs=${startTs}&endTs=${endTs}`)

  // รีวิวที่ถูกแก้ภายหลัง (มีรีวิวอื่นอ้าง revision_of) ไม่นับ — นับเฉพาะผลล่าสุด
  const superseded = new Set(rows.map((r) => r.revision_of).filter(Boolean).map(String))
  const n = rows.filter(
    (r) => !superseded.has(String(r._id)) && r.decision === "reviewed_suspicious"
  ).length
  const capped = rows.length >= 500 // API คืนสูงสุด 500 แถว

  return {
    status: "ok",
    value: `${n}${capped ? "+" : ""} เคส`,
    tone: n > 0 ? "clay" : "forest",
    hint: "นับเฉพาะผลรีวิวล่าสุดที่ตัดสินว่าน่าสงสัย",
  }
}

/* ---------- 2) ติดเครื่องนาน (ข้อมูลเมื่อวาน) ---------- */

type EngineRow = { TruckPlateNo?: string; Date?: string; "ส่วนต่าง"?: number }

async function loadEngineOn(): Promise<StatState> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const rows = await getJson<EngineRow[]>(
    `/api/engineon/summary?year=${yesterday.getFullYear()}&month=${yesterday.getMonth() + 1}`
  )

  const byDay = new Map<string, EngineRow[]>()
  for (const r of rows) {
    if (!r.Date) continue
    const d = new Date(r.Date)
    if (Number.isNaN(d.getTime())) continue
    const key = ymdLocal(d)
    const list = byDay.get(key)
    if (list) list.push(r)
    else byDay.set(key, [r])
  }
  if (byDay.size === 0) {
    return { status: "error", message: "ยังไม่มีข้อมูล Engine-On ของเดือนนี้" }
  }

  // ETL รัน 04:00 / 06:30 — ใช้วันล่าสุดที่มีข้อมูล (ปกติคือเมื่อวาน)
  const latest = [...byDay.keys()].sort().at(-1)!
  const plates = new Set(
    byDay
      .get(latest)!
      .filter((r) => (r["ส่วนต่าง"] ?? 0) > 60)
      .map((r) => r.TruckPlateNo ?? "")
  )
  const n = plates.size

  const isYesterday = latest === ymdLocal(yesterday)
  const [ly, lm, ld] = latest.split("-").map(Number)
  const dayLabel = isYesterday
    ? "เมื่อวาน"
    : new Date(ly, lm - 1, ld).toLocaleDateString("th-TH", { day: "numeric", month: "short" })

  return {
    status: "ok",
    value: `${n} คัน`,
    tone: n > 0 ? "clay" : "forest",
    label: `ติดเครื่องนาน (${dayLabel})`,
    hint: "จำนวนคันที่ส่วนต่างเวลาติดเครื่องเกิน 60 นาที",
  }
}

/* ---------- 3) Pipeline ล่าสุด ---------- */

type EtlJob = { job_type?: string; status?: string; start_time?: string; end_time?: string }

async function loadPipeline(): Promise<StatState> {
  const jobs = await getJson<EtlJob[]>("/api/etl_jobs")
  const job = jobs[0]
  if (!job) return { status: "error", message: "ยังไม่มีประวัติ Pipeline" }

  const at = job.end_time ?? job.start_time
  let when = ""
  if (at) {
    const d = new Date(at)
    const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    when =
      ymdLocal(d) === ymdLocal(new Date())
        ? time
        : `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${time}`
  }

  const map: Record<string, { text: string; tone: Tone }> = {
    success: { text: "สำเร็จ", tone: "forest" },
    failed: { text: "ล้มเหลว", tone: "clay" },
    running: { text: "กำลังรัน", tone: "ink" },
  }
  const s = map[job.status ?? ""] ?? { text: job.status ?? "ไม่ทราบสถานะ", tone: "ink" as Tone }

  return {
    status: "ok",
    value: when ? `${s.text} · ${when}` : s.text,
    tone: s.tone,
    hint: job.job_type ? `งาน: ${job.job_type}` : undefined,
  }
}

/* ---------- UI ---------- */

function StatCard({
  href,
  label,
  state,
}: {
  href: string
  label: string
  state: StatState
}) {
  const base =
    "block min-w-[150px] flex-1 rounded-2xl bg-surface px-4 py-3 outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-moss sm:flex-none"

  if (state.status === "loading") {
    return (
      <div className={`${base} animate-pulse`} aria-busy="true" aria-label={`${label}: กำลังโหลด`}>
        <div className="h-[18px] w-24 rounded bg-line" />
        <div className="mt-1.5 h-[26px] w-16 rounded bg-line" />
      </div>
    )
  }

  const shownLabel = state.status === "ok" && state.label ? state.label : label
  const title = state.status === "error" ? state.message : state.hint

  return (
    <Link href={href} className={base} title={title}>
      <span className="block text-[13px] text-muted-ink">{shownLabel}</span>
      {state.status === "ok" ? (
        <span className={`block text-[20px] font-semibold ${TONE_CLASS[state.tone ?? "ink"]}`}>
          {state.value}
        </span>
      ) : (
        <span className="block text-[20px] font-semibold text-muted-ink">
          —<span className="sr-only"> ({state.message})</span>
        </span>
      )}
    </Link>
  )
}

export function HeroStats() {
  const [fuel, setFuel] = useState<StatState>(LOADING)
  const [engine, setEngine] = useState<StatState>(LOADING)
  const [pipeline, setPipeline] = useState<StatState>(LOADING)

  useEffect(() => {
    let alive = true
    const run = (load: () => Promise<StatState>, set: (s: StatState) => void) =>
      load()
        .then((s) => alive && set(s))
        .catch((e) => alive && set({ status: "error", message: errMsg(e) }))

    run(loadSuspicious, setFuel)
    run(loadEngineOn, setEngine)
    run(loadPipeline, setPipeline)
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="flex flex-wrap gap-3">
      <StatCard href="/fueldetection" label="เคสน่าสงสัยเดือนนี้" state={fuel} />
      <StatCard href="/engineon" label="ติดเครื่องนาน (เมื่อวาน)" state={engine} />
      <StatCard href="/pipeline" label="Pipeline ล่าสุด" state={pipeline} />
    </div>
  )
}
