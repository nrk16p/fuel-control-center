import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

type Decision =
  | "reviewed_ok"
  | "reviewed_suspicious"
  | "false_positive"
  | "need_follow_up"

/* ============================================================
   GET: Fetch reviews (DB-first on timestamp)
============================================================ */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const plate = params.get("plate")?.trim() || ""
    const startTs = Number(params.get("startTs") || 0)
    const endTs = Number(params.get("endTs") || 0)

    const client = await clientPromise
    const db = client.db("analytics")

    const q: any = {}
    if (plate) q.plate = plate

    // 🔎 Filter by DB timestamps only (Accuracy)
    if (startTs && endTs) {
      q.start_ts = { $lte: endTs }
      q.end_ts = { $gte: startTs }
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
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 }
    )
  }
}

/* ============================================================
   POST: Create review (DB-first on timestamp + business values)
============================================================ */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const plate: string = (body.plate || "").trim()

    // 🔴 Source of Truth: timestamps from FE
    const startTs: number = Number(body.start_ts)
    const endTs: number = Number(body.end_ts)

    // (optional) keep for display only
    const startDate: string | undefined = body.startDate
    const startTime: string | undefined = body.startTime
    const endDate: string | undefined = body.endDate
    const endTime: string | undefined = body.endTime

    const fuelStart = Number(body.fuelStart)
    const fuelEnd = Number(body.fuelEnd)
    const fuelDiff = Number(body.fuelDiff)
    const durationMin = Number(body.durationMin ?? 0)

    const decision: Decision = body.decision || "reviewed_ok"
    const note: string = (body.note || "").trim()
    const reviewer: string = (body.reviewer || "ops").trim()

    const revisionOf: string | null = body.revisionOf || null

    // 🔒 Enforce business fields for Accuracy
    if (
      !plate ||
      !startTs ||
      !endTs ||
      Number.isNaN(fuelStart) ||
      Number.isNaN(fuelEnd) ||
      Number.isNaN(fuelDiff)
    ) {
      return NextResponse.json(
        { error: "Missing required business fields (timestamps, fuelStart, fuelEnd, fuelDiff)" },
        { status: 400 }
      )
    }

    const safeStartTs = Math.min(startTs, endTs)
    const safeEndTs = Math.max(startTs, endTs)

    const client = await clientPromise
    const db = client.db("analytics")

    const doc = {
      plate,

      // Display only (not for logic)
      start_date: startDate,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,

      // 🔴 Business truth
      start_ts: safeStartTs,
      end_ts: safeEndTs,

      fuel_start: fuelStart,
      fuel_end: fuelEnd,
      fuel_diff: fuelDiff,
      duration_min: durationMin,

      decision,
      note,
      reviewer,

      revision_of: revisionOf,
      created_at: new Date(),
    }

    const result = await db.collection("fuel_drop_reviews").insertOne(doc)
    return NextResponse.json({ ok: true, insertedId: result.insertedId })
  } catch (err) {
    console.error("FUEL REVIEWS POST ERROR:", err)
    return NextResponse.json(
      { error: "Failed to create review" },
      { status: 500 }
    )
  }
}
