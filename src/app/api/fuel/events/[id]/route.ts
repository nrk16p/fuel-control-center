import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS, FIXTURE_SERIES } from "@/lib/fuel-fixtures"
import { buildSeries, sliceWindow, type SeriesDoc } from "@/lib/fuel-series"
import type { FuelEvent, FuelEventDoc } from "@/lib/fuel-types"
import { decodeColumns, fuelToLitres, toDegrees } from "@/lib/series-codec"
import { windowDateKeys } from "@/lib/thai-time"

const PAD_MS = 3 * 3_600_000
const HISTORY_DAYS = 30
const codec = { decodeColumns, fuelToLitres, toDegrees }

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    let event: FuelEvent | FuelEventDoc | null
    let docs: SeriesDoc[] = []
    let history: (FuelEvent | FuelEventDoc)[] = []
    if (fixturesOn()) {
      event = FIXTURE_EVENTS.find((e) => e._id === id) ?? null
      if (event) {
        const plate = event.plate
        docs = FIXTURE_SERIES.filter((d) => d.plate === plate)
        history = FIXTURE_EVENTS.filter((e) => e.plate === plate && e._id !== id)
      }
    } else {
      const db = await analytics()
      const events = db.collection<FuelEventDoc>("fuel_events")
      const found = await events.findOne({ _id: id })
      event = found
      if (found) {
        const keys = windowDateKeys(found.start.getTime(), found.end.getTime(), PAD_MS)
        docs = await db.collection<SeriesDoc>("gps_series").find({ plate: found.plate, date_key: { $in: keys } }).toArray()
        history = await events
          .find(
            { plate: found.plate, _id: { $ne: id }, start: { $gte: new Date(Date.now() - HISTORY_DAYS * 86_400_000) } },
            { projection: { features: 0 } },
          )
          .sort({ start: -1 })
          .limit(30)
          .toArray()
      }
    }
    if (!event) return NextResponse.json({ error: "ไม่พบเหตุการณ์นี้" }, { status: 404 })
    const startMs = new Date(event.start).getTime()
    const endMs = new Date(event.end).getTime()
    const series = buildSeries(docs, codec).map((s) => sliceWindow(s, startMs - PAD_MS, endMs + PAD_MS))
    return NextResponse.json({ event, series, history })
  } catch (err) {
    console.error("FUEL EVENT DETAIL ERROR:", err)
    return NextResponse.json({ error: "โหลดรายละเอียดเหตุการณ์ไม่สำเร็จ" }, { status: 500 })
  }
}
