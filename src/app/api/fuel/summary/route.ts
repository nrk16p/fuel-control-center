import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS, FIXTURE_SUMMARY } from "@/lib/fuel-fixtures"
import type { DailySummary, FuelEventDoc } from "@/lib/fuel-types"
import { yesterdayKey } from "@/lib/thai-time"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || yesterdayKey(Date.now())
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "date ต้องเป็น YYYY-MM-DD" }, { status: 400 })
  try {
    if (fixturesOn()) {
      const summary = { ...FIXTURE_SUMMARY, _id: date }
      const checkFirst = summary.check_first.flatMap((id) => FIXTURE_EVENTS.filter((e) => e._id === id))
      return NextResponse.json({ date, summary, checkFirst })
    }
    const db = await analytics()
    const summary = await db.collection<DailySummary>("fuel_daily_summary").findOne({ _id: date })
    const ids = summary?.check_first ?? []
    const found = ids.length
      ? await db
          .collection<FuelEventDoc>("fuel_events")
          .find({ _id: { $in: ids } }, { projection: { features: 0 } })
          .toArray()
      : []
    const checkFirst = [...found].sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id))
    return NextResponse.json({ date, summary, checkFirst })
  } catch (err) {
    console.error("FUEL SUMMARY ERROR:", err)
    return NextResponse.json({ error: "โหลดสรุปไม่สำเร็จ" }, { status: 500 })
  }
}
