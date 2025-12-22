import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { toDateFromThai } from "@/lib/dt-th"

type Decision = "reviewed_ok" | "reviewed_suspicious" | "false_positive" | "need_follow_up"

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const plate = params.get("plate")?.trim() || ""
    const startDate = params.get("startDate") || ""
    const endDate = params.get("endDate") || ""

    const client = await clientPromise
    const db = client.db("analytics") // ✅ analytics

    const q: any = {}
    if (plate) q.plate = plate

    if (startDate && endDate) {
      const start = toDateFromThai(startDate, "00:00:00")
      const end = toDateFromThai(endDate, "23:59:59")
      if (start && end) {
        q.start_ts = { $lte: end.getTime() }
        q.end_ts = { $gte: start.getTime() }
      }
    }

    const rows = await db
      .collection("fuel_drop_reviews")
      .find(q)
      .sort({ created_at: -1 })
      .limit(500)
      .toArray()

    return NextResponse.json(rows)
  } catch (err) {
    console.error("FUEL REVIEWS GET ERROR:", err)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const plate: string = (body.plate || "").trim()
    const startDate: string = body.startDate
    const startTime: string = body.startTime
    const endDate: string = body.endDate
    const endTime: string = body.endTime

    const fuelStart = Number(body.fuelStart ?? 0)
    const fuelEnd = Number(body.fuelEnd ?? 0)
    const fuelDiff = Number(body.fuelDiff ?? (fuelStart - fuelEnd))
    const durationMin = Number(body.durationMin ?? 0)

    const decision: Decision = body.decision || "reviewed_ok"
    const note: string = (body.note || "").trim()
    const reviewer: string = (body.reviewer || "ops").trim()

    const revisionOf: string | null = body.revisionOf || null // ✅ new

    if (!plate || !startDate || !startTime || !endDate || !endTime) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const start = toDateFromThai(startDate, startTime)
    const end = toDateFromThai(endDate, endTime)
    if (!start || !end) return NextResponse.json({ error: "Invalid date/time" }, { status: 400 })

    const startTs = Math.min(start.getTime(), end.getTime())
    const endTs = Math.max(start.getTime(), end.getTime())

    const client = await clientPromise
    const db = client.db("analytics") // ✅ analytics

    const doc = {
      plate,
      start_date: startDate,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,
      start_ts: startTs,
      end_ts: endTs,

      fuel_start: fuelStart,
      fuel_end: fuelEnd,
      fuel_diff: fuelDiff,
      duration_min: durationMin,

      decision,
      note,
      reviewer,

      revision_of: revisionOf, // ✅ revision chain (optional)
      created_at: new Date(),
    }

    const result = await db.collection("fuel_drop_reviews").insertOne(doc)
    return NextResponse.json({ ok: true, insertedId: result.insertedId })
  } catch (err) {
    console.error("FUEL REVIEWS POST ERROR:", err)
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 })
  }
}
