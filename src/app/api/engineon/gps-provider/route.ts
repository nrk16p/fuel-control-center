import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { PROVIDERS, buildPayload, type ProviderKey } from "@/lib/gps-provider"

// Which GPS provider sent data for each truck/day — read-only over gps.distance_<provider>.
// ?from=YYYY-MM-DD&to=YYYY-MM-DD (≤ 366 days). Also returns the latest day in the 180 days
// before `from`, so a truck without data can say where it was last seen.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const PRIOR_DAYS = 180

function shift(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to || shift(from, 366) < to) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD, at most 366 days apart" }, { status: 400 })
  }

  try {
    const db = (await clientPromise).db("gps")
    const priorFrom = shift(from, -PRIOR_DAYS)
    const rows: { provider: ProviderKey; vehicle_no: string; date_key: string }[] = []

    await Promise.all(PROVIDERS.map(async ({ key }) => {
      const col = db.collection(`distance_${key}`)
      const [inRange, prior] = await Promise.all([
        col.find({ date_key: { $gte: from, $lte: to } }, { projection: { _id: 0, vehicle_no: 1, date_key: 1 } }).toArray(),
        col.aggregate([
          { $match: { date_key: { $gte: priorFrom, $lt: from } } },
          { $group: { _id: "$vehicle_no", date_key: { $max: "$date_key" } } },
        ]).toArray(),
      ])
      for (const d of inRange) rows.push({ provider: key, vehicle_no: d.vehicle_no, date_key: d.date_key })
      for (const d of prior) rows.push({ provider: key, vehicle_no: d._id, date_key: d.date_key })
    }))

    return NextResponse.json(buildPayload(from, to, rows), {
      headers: { "Cache-Control": "private, max-age=300" },
    })
  } catch (error) {
    console.error("gps-provider fetch error:", error)
    return NextResponse.json({ error: "Failed to load GPS providers" }, { status: 500 })
  }
}
