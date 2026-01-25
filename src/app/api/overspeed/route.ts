import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("overspeed")

    const query: any = {}
    if (year) query.start_datetime = Number(year)
    if (month) query.start_datetime = Number(month)

    const data = await collection
      .find(query)
            .project({
        _id: 1,
       segment_id: 1,
       vehicle: 1,
       start_datetime: 1,
       end_datetime:1,
       duration_minutes:1,
       sum_distance_km:1,
       avg_speed:1,
       max_speed:1,
       w_speed:1,
       speed_group:1,
      })
      .sort({ start_datetime: -1, vehicle: 1 })
      .toArray()

    const dataWithMonthYear = data.map(item => {
      const date = new Date(item.start_datetime)
      return {
        ...item,
        month: date.getMonth() + 1, // 1-12
        year: date.getFullYear()
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
