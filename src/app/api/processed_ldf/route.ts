import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // ================================
    // 🎯 PARAMS
    // ================================
    const plate = searchParams.get("plate")
    const client = searchParams.get("client")
    const keyword = searchParams.get("keyword")

    const start_date = searchParams.get("start_date")
    const end_date = searchParams.get("end_date")

    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    // ================================
    // 🧠 CONNECT
    // ================================
    const mongo = await clientPromise
    const db = mongo.db("analytics")
    const collection = db.collection("processed_ldf")

    // ================================
    // 🧠 BUILD FILTER
    // ================================
    const filter: any = {}

    // 🚚 plate
    if (plate) {
      filter["TruckPlateNo"] = { $regex: plate, $options: "i" }
    }

    // 🧠 client
    if (client) {
      filter["client"] = client
    }

    // 📅 date range
    if (start_date || end_date) {
      filter["ออก LDT"] = {}

      if (start_date) {
        filter["ออก LDT"]["$gte"] = new Date(start_date)
      }

      if (end_date) {
        filter["ออก LDT"]["$lte"] = new Date(end_date)
      }
    }

    // 🔍 keyword search
    if (keyword) {
      filter["$or"] = [
        { TicketNo: { $regex: keyword, $options: "i" } },
        { TruckPlateNo: { $regex: keyword, $options: "i" } },
        { PlantName: { $regex: keyword, $options: "i" } },
        { SiteName: { $regex: keyword, $options: "i" } }
      ]
    }

    // ================================
    // 🚀 QUERY
    // ================================
    const cursor = collection
      .find(filter, {
        projection: {
          _id: 0,
          TicketNo: 1,
          TruckPlateNo: 1,
          PlantName: 1,
          SiteName: 1,
          Quantity: 1,
          plan_distance: 1,
          PlantToSiteDistance: 1,
          "ออก LDT": 1,
          client: 1
        }
      })
      .sort({ "ออก LDT": -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const docs = await cursor.toArray()

    // ================================
    // 🧠 CLEAN RESPONSE
    // ================================
    const data = docs.map((d: any) => ({
      ticket_no: d.TicketNo,
      plate: d.TruckPlateNo,
      plant: d.PlantName,
      site: d.SiteName,
      qty: d.Quantity,
      distance_plan: Number(d.plan_distance || 0),
      distance_actual: Number(d.PlantToSiteDistance || 0),
      ldt: d["ออก LDT"],
      client: d.client
    }))

    const total = await collection.countDocuments(filter)

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error("❌ processed_ldf error:", error)
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}