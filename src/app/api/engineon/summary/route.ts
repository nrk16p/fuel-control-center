import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("engineon_trip_summary")

    const query: any = {}
    if (year) query.year = Number(year)
    if (month) query.month = Number(month)

    const data = await collection
      .find(query)
      .sort({ Date: -1, TruckPlateNo: 1 })
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("MongoDB Fetch Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch engineon trip summary" },
      { status: 500 }
    )
  }
}
