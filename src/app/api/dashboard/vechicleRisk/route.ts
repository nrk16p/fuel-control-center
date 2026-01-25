import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"


export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const yearsParam = searchParams.get("years") || ''
    const plate = searchParams.get("plate") || ""

    // Parse years (comma-separated, e.g., "2024,2025,2026")
    const years = yearsParam
      ? yearsParam.split(',').map(y => parseInt(y.trim())).filter(y => !isNaN(y))
      : [new Date().getFullYear()]

    console.log("GET years, plate:", years, plate)

    const client = await clientPromise
    const db = client.db("atms")
    const col = db.collection("drivers_risk")

    const data = await col
      .find({
        year: { $in: years },
        plateh: plate ? { $regex: plate, $options: "i" } : { $exists: true },
      })
      .sort({ year: -1, month: -1, driver: 1 })
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("❌ GET vehicle risk error:", error)
    return NextResponse.json(
      { error: "Failed to fetch vehicle risk data" },
      { status: 500 }
    )
  }
}