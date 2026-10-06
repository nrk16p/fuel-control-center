import type { Filter } from "mongodb"
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { buildEventsQuery, matchesFilter, parseEventFilter, rankEvents } from "@/lib/fuel-events"
import { FIXTURE_EVENTS } from "@/lib/fuel-fixtures"
import type { FuelEventDoc } from "@/lib/fuel-types"
import { yesterdayKey } from "@/lib/thai-time"

// เดือนหนึ่งมีราว 1,000 เหตุการณ์ — ดึงมาเรียงในหน่วยความจำได้สบาย
const FETCH_CAP = 2000

export async function GET(request: Request) {
  const parsed = parseEventFilter(new URL(request.url).searchParams, yesterdayKey(Date.now()))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const filter = parsed.value
  try {
    if (fixturesOn()) {
      const ranked = rankEvents(FIXTURE_EVENTS.filter((e) => matchesFilter(e, filter)))
      return NextResponse.json({ filter, total: ranked.length, truncated: false, events: ranked.slice(0, filter.limit) })
    }
    const docs = await (await analytics())
      .collection<FuelEventDoc>("fuel_events")
      .find(buildEventsQuery(filter) as Filter<FuelEventDoc>, { projection: { features: 0 } })
      .limit(FETCH_CAP)
      .toArray()
    const ranked = rankEvents(docs)
    return NextResponse.json({
      filter,
      total: ranked.length,
      truncated: ranked.length >= FETCH_CAP,
      events: ranked.slice(0, filter.limit),
    })
  } catch (err) {
    console.error("FUEL EVENTS ERROR:", err)
    return NextResponse.json({ error: "โหลดเหตุการณ์ไม่สำเร็จ" }, { status: 500 })
  }
}
