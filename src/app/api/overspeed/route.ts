import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

/**
 * Convert UTC datetime -> Bangkok time (UTC+7)
 */
function toBkkDate(dt: Date | string) {
  const d = new Date(dt)
  return new Date(d.getTime() + 7 * 60 * 60 * 1000)
}

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function timeOnly(d: Date) {
  return d.toTimeString().slice(0, 8) // HH:mm:ss
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const yearParam = searchParams.get("year")
    const monthParam = searchParams.get("month")

    const year =
      yearParam && yearParam !== "all" ? Number(yearParam) : undefined
    const month =
      monthParam && monthParam !== "all" ? Number(monthParam) : undefined

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("overspeed")

    const query: any = {}

    // --------------------------------------------------
    // 🔍 Filter by UTC datetime (CORRECT WAY)
    // --------------------------------------------------
    if (year && month) {
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
      query.start_datetime = { $gte: startDate, $lte: endDate }
    } else if (year && !month) {
      query.start_datetime = {
        $gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
        $lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      }
    } else if (!year && month) {
      query.$expr = { $eq: [{ $month: "$start_datetime" }, month] }
    }

    // --------------------------------------------------
    // 📦 Fetch data
    // --------------------------------------------------
    const data = await collection
      .find(query)
      .project({
        _id: 1,
        segment_id: 1,
        vehicle: 1,
        start_datetime: 1,
        end_datetime: 1,
        duration_minutes: 1,
        sum_distance_km: 1,
        avg_speed: 1,
        max_speed: 1,
        w_speed: 1,
        speed_group: 1,
      })
      .sort({ start_datetime: -1, vehicle: 1 })
      .toArray()

    // --------------------------------------------------
    // 🔁 Enrich response (UTC -> BKK)
    // --------------------------------------------------
    const enriched = data.map((item) => {
      const startBkk = toBkkDate(item.start_datetime)
      const endBkk = toBkkDate(item.end_datetime)

      return {
        ...item,

        // ✅ keep original UTC
        start_datetime: item.start_datetime,
        end_datetime: item.end_datetime,

        // ✅ Bangkok date & time
        start_date: dateOnly(startBkk),
        start_time: timeOnly(startBkk),
        end_date: dateOnly(endBkk),
        end_time: timeOnly(endBkk),

        // ✅ month/year (BKK based)
        month: startBkk.getMonth() + 1,
        year: startBkk.getFullYear(),
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error("MongoDB Fetch Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch overspeed" },
      { status: 500 }
    )
  }
}
