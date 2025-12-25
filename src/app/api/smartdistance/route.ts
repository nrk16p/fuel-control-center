import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const year = searchParams.get("year")
    const month = searchParams.get("month")

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("smartdistance")

    const query: any = {}

    // ✅ FIX: TicketCreateAt เป็น string
    if (year && month) {
      const mm = month.padStart(2, "0")
      query.TicketCreateAt = { $regex: `^${year}-${mm}` }
    } else if (year) {
      query.TicketCreateAt = { $regex: `^${year}` }
    }

    const data = await collection
      .find(query)
      .sort({ TicketCreateAt: -1 })
      .limit(1000)
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("Smartdistance API Error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
