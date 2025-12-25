import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ticketNo = searchParams.get("TicketNo")

    if (!ticketNo) {
      return NextResponse.json(
        { error: "TicketNo is required" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("raw_smartdistance")

    const doc = await collection.findOne(
      { TicketNo: ticketNo },
      {
        projection: {
          _id: 0,
          geojson: 1,
          TicketNo: 1,
          TruckPlateNo: 1,
          PlantCode: 1,
          SiteCode: 1,
          logic_version: 1,
          loop_start_at: 1,
          loop_end_at: 1,
          plant_lat: 1,
          plant_lng: 1,
          site_lat: 1,
          site_lng: 1,
        },
      }
    )

    if (!doc?.geojson?.geometry) {
      return NextResponse.json(
        { error: "GeoJSON not found for this TicketNo" },
        { status: 404 }
      )
    }

    // ✅ merge geojson.properties (timestamps อยู่ตรงนี้)
    const properties = {
      ...(doc.geojson.properties || {}),
      TicketNo: doc.TicketNo,
      TruckPlateNo: doc.TruckPlateNo,
      PlantCode: doc.PlantCode,
      SiteCode: doc.SiteCode,
      logic_version: doc.logic_version,
      loop_start_at: doc.loop_start_at,
      loop_end_at: doc.loop_end_at,
      plant: [doc.plant_lng, doc.plant_lat],
      site: [doc.site_lng, doc.site_lat],
    }

    return NextResponse.json({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: doc.geojson.geometry,
          properties,
        },
      ],
    })
  } catch (error) {
    console.error("❌ raw-smartdistance TicketNo API error:", error)
    return NextResponse.json(
      { error: "Failed to fetch raw smartdistance geojson" },
      { status: 500 }
    )
  }
}
