import type { Filter } from "mongodb"
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { buildEventsPipeline, buildEventsQuery, matchesFilter, parseEventFilter, rankEvents } from "@/lib/fuel-events"
import { FIXTURE_EVENTS } from "@/lib/fuel-fixtures"
import type { FuelEventDoc } from "@/lib/fuel-types"
import { yesterdayKey } from "@/lib/thai-time"

export async function GET(request: Request) {
  const parsed = parseEventFilter(new URL(request.url).searchParams, yesterdayKey(Date.now()))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const filter = parsed.value
  try {
    if (fixturesOn()) {
      const ranked = rankEvents(FIXTURE_EVENTS.filter((e) => matchesFilter(e, filter)))
      const events = ranked.slice(0, filter.limit)
      return NextResponse.json({ filter, total: ranked.length, truncated: ranked.length > events.length, events })
    }
    // เรียงทั้งช่วงใน Mongo แล้วค่อยตัด (วันหนึ่งเกือบพันเหตุการณ์) + นับทั้งหมดไว้บอก "แสดง X จาก Y"
    const col = (await analytics()).collection<FuelEventDoc>("fuel_events")
    const [events, total] = await Promise.all([
      col.aggregate<FuelEventDoc>(buildEventsPipeline(filter)).toArray(),
      col.countDocuments(buildEventsQuery(filter) as Filter<FuelEventDoc>),
    ])
    return NextResponse.json({ filter, total, truncated: total > events.length, events })
  } catch (err) {
    console.error("FUEL EVENTS ERROR:", err)
    return NextResponse.json({ error: "โหลดเหตุการณ์ไม่สำเร็จ" }, { status: 500 })
  }
}
