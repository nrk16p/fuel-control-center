import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const year = searchParams.get("year")
    const month = searchParams.get("month")
    const search = searchParams.get("search")
    const plant = searchParams.get("plant")
    const site = searchParams.get("site")

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("smartdistance")

    const query: any = {}

    /* ---------------------------------
       📅 Date filter (TicketCreateAt is string)
    ---------------------------------- */
    if (year && month) {
      const mm = month.padStart(2, "0")
      query.TicketCreateAt = { $regex: `^${year}-${mm}` }
    } else if (year) {
      query.TicketCreateAt = { $regex: `^${year}` }
    }

    /* ---------------------------------
       🔍 Search (Ticket / Plate)
    ---------------------------------- */
    if (search && search.trim() !== "") {
      query.$or = [
        { TicketNo: { $regex: search, $options: "i" } },
        { TruckPlateNo: { $regex: search, $options: "i" } },
      ]
    }

    /* ---------------------------------
       🏭 PlantCode
    ---------------------------------- */
    if (plant && plant.trim() !== "") {
      query.PlantCode = plant
    }

    /* ---------------------------------
       📍 SiteCode
    ---------------------------------- */
    if (site && site.trim() !== "") {
      query.SiteCode = site
    }

    const data = await collection
      .find(query)
      .sort({ TicketCreateAt: -1 })
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("Smartdistance API Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch smartdistance" },
      { status: 500 }
    )
  }
}
