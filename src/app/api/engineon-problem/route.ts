import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const minMinutes = Number(searchParams.get("min_minutes") || 30)
    const plate = searchParams.get("plate")
    const date = searchParams.get("date") // DD/MM/YYYY

    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("raw_engineon")

    const match: any = {
      total_engine_on_min: { $gte: minMinutes },
    }

    if (plate) match["ทะเบียนพาหนะ"] = plate
    if (date) match["date"] = date

    const data = await col
      .aggregate([
        { $match: match },
        {
          $project: {
            _id: 1,
            plate: "$ทะเบียนพาหนะ",
            date: 1,
            start_time: 1,
            end_time: 1,
            total_engine_on_min: 1,
            total_engine_on_hr: 1,
            lat: 1,
            lng: 1,
            nearest_plant: 1,
            location: "$สถานที่",
          },
        },
        { $sort: { total_engine_on_min: -1 } },
        { $limit: 500 },
      ])
      .toArray()

    return NextResponse.json(data)
  } catch (err) {
    console.error("Engineon problem API error:", err)
    return NextResponse.json(
      { error: "Failed to load engine-on problem data" },
      { status: 500 }
    )
  }
}
