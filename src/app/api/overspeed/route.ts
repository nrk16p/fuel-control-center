import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get("year")
    const monthParam = searchParams.get("month")

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("overspeed")

    const query: any = {}

    const year = yearParam && yearParam !== "all" ? Number(yearParam) : undefined
    const month = monthParam && monthParam !== "all" ? Number(monthParam) : undefined

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

    const dataWithMonthYear = data.map(item => {
      const date = new Date(item.start_datetime)
      return {
        ...item,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
      }
    })

    return NextResponse.json(dataWithMonthYear)
  } catch (error) {
    console.error("MongoDB Fetch Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch overspeed" },
      { status: 500 }
    )
  }
}