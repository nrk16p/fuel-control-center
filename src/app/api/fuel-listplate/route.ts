import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

/* ============================================================================
   GET – list plate (optional filter by date range)
   GET /api/driver
   GET /api/drivers?month=xx&year=xxxx
============================================================================ */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const month = searchParams.get("month") || ""
    const year = searchParams.get("year") || ""

    const month_from = month.split(",").map(Number)[0]
    const month_to = month.split(",").map(Number)[1]
    const year_from = year.split(",").map(Number)[0]
    const year_to = year.split(",").map(Number)[1]

    // console.log("GET month, year:", month_from, month_to, year_from, year_to)

    const client = await clientPromise
    const db = client.db("atms")
    const col = db.collection("drivers_risk")

    const data = await col
      .find({
        month: { $gte: month_from , $lte: month_to },
        year: { $gte: year_from , $lte: year_to },
      })
      .sort({ plateh: 1 })
      .toArray()
    // console.log("data:", data)  
    const platelist = data.map(item => item.plateh)
    const distincts = [...new Set(platelist)]

    return NextResponse.json(distincts)
  } catch (error) {
    console.error("❌ GET drivers error:", error)
    return NextResponse.json(
      { error: "Failed to fetch drivers" },
      { status: 500 }
    )
  }
}