import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const plant = searchParams.get("plant")
    const zone = searchParams.get("zone")
    const status = searchParams.get("status")
    const clientName = searchParams.get("client")

    // 🧠 connect mongo
    const client = await clientPromise
    const db = client.db("atms")
    const collection = db.collection("zone_master")  // 👈 ตั้งชื่อ collection นี้

    // ================================
    // 🧠 build filter
    // ================================
    const filter: any = {}

    if (plant) {
      filter["Plant"] = plant
    }

    if (zone) {
      filter["โซน"] = zone
    }

    if (status) {
      filter["สถานะการขาย"] = { $regex: status, $options: "i" }
    }

    if (clientName) {
      filter["Client"] = clientName
    }

    // ================================
    // 🚀 query
    // ================================
    const docs = await collection.find(filter).toArray()

    const cleanDocs = docs.map(d => ({
      ...d,
      _id: d._id.toString()
    }))

    if (!cleanDocs.length) {
      return NextResponse.json([], { status: 404 })
    }

    return NextResponse.json(cleanDocs)

  } catch (error) {
    console.error("❌ Error fetching zone:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}