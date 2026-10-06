import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS, FIXTURE_SERIES } from "@/lib/fuel-fixtures"
import { buildSeries, coverageVerdict, lastSeenOf, plateCandidates, resolvePlate, type SeriesDoc } from "@/lib/fuel-series"
import type { FuelEvent, FuelEventDoc, Source } from "@/lib/fuel-types"
import { decodeColumns, fuelToLitres, toDegrees } from "@/lib/series-codec"
import { addDays, daySpan, isDateKey, yesterdayKey } from "@/lib/thai-time"

const MAX_DAYS = 14
const SOURCES: Source[] = ["besttech", "terminus"]
const codec = { decodeColumns, fuelToLitres, toDegrees }

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const plate = params.get("plate")?.trim() || ""
  const yesterday = yesterdayKey(Date.now())
  const to = params.get("to") || yesterday
  const from = params.get("from") || addDays(to, -2)
  const source = params.get("source") || null
  if (!plate) return NextResponse.json({ error: "ต้องระบุทะเบียน" }, { status: 400 })
  if (!isDateKey(from) || !isDateKey(to) || to < from) {
    return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 })
  }
  if (daySpan(from, to) > MAX_DAYS) {
    return NextResponse.json({ error: `เลือกได้ไม่เกิน ${MAX_DAYS} วัน` }, { status: 400 })
  }
  if (source && !SOURCES.includes(source as Source)) return NextResponse.json({ error: "แหล่ง GPS ไม่ถูกต้อง" }, { status: 400 })
  try {
    let docs: SeriesDoc[]
    let events: (FuelEvent | FuelEventDoc)[]
    // ถ้าช่วงนี้ไม่มีข้อมูลเลย: เอกสารล่าสุดที่มีข้อมูล เพื่อบอกว่าหายไปตั้งแต่เมื่อไร/ที่ไหน
    let latest: SeriesDoc | null = null
    const inRange = (d: { date_key: string }) => d.date_key >= from && d.date_key <= to
    // ค้นจากหน้าแรกส่งแบบ "71-8623" มา แต่ gps_series เก็บ "สบ.71-8623"
    const plates = plateCandidates(plate)
    if (fixturesOn()) {
      const own = FIXTURE_SERIES.filter((d) => plates.includes(d.plate))
      docs = own.filter((d) => inRange(d) && (!source || d.source === source))
      events = FIXTURE_EVENTS.filter((e) => plates.includes(e.plate) && inRange(e))
      if (!docs.some((d) => d.n > 0)) {
        latest = own.filter((d) => d.n > 0).sort((a, b) => b.date_key.localeCompare(a.date_key))[0] ?? null
      }
    } else {
      const db = await analytics()
      const gps = db.collection<SeriesDoc>("gps_series")
      docs = await gps
        .find({ plate: { $in: plates }, date_key: { $gte: from, $lte: to }, ...(source ? { source: source as Source } : {}) })
        .toArray()
      events = await db
        .collection<FuelEventDoc>("fuel_events")
        .find({ plate: { $in: plates }, date_key: { $gte: from, $lte: to } }, { projection: { features: 0 } })
        .toArray()
      if (!docs.some((d) => d.n > 0)) latest = await gps.findOne({ plate: { $in: plates }, n: { $gt: 0 } }, { sort: { date_key: -1 } })
    }
    const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    return NextResponse.json({
      plate: resolvePlate(plate, [...docs.map((d) => d.plate), latest?.plate, ...events.map((e) => e.plate)]),
      from,
      to,
      series: buildSeries(docs, codec),
      days: docs.map((d) => ({ date_key: d.date_key, source: d.source, status: d.coverage.status, minutes: d.coverage.minutes })),
      verdict: coverageVerdict(docs.map((d) => ({ source: d.source, status: d.coverage.status }))),
      lastSeen: latest ? lastSeenOf(latest, codec) : null,
      events: sorted,
    })
  } catch (err) {
    console.error("FUEL SERIES ERROR:", err)
    return NextResponse.json({ error: "โหลดข้อมูล GPS ไม่สำเร็จ" }, { status: 500 })
  }
}
