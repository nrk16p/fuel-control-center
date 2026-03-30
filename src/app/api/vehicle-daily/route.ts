import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const plate = searchParams.get("plate")   // ทะเบียน
    const t_date = searchParams.get("t_date") // วันที่

    // 🧠 Connect Mongo
    const client = await clientPromise
    const db = client.db("atms")
    const collection = db.collection("vehicle_daily")

    // ================================
    // 🧠 BUILD FILTER
    // ================================
    const filter: any = {}

    if (plate) {
      filter["ทะเบียน"] = { $regex: plate, $options: "i" }
    }

    if (t_date) {
      filter["t_date"] = t_date
    }

    // ================================
    // 🚀 QUERY
    // ================================
    const docs = await collection
      .find(filter)
      .sort({ t_date: -1 })
      .limit(1000)
      .toArray()

    if (!docs || docs.length === 0) {
      return NextResponse.json([], { status: 404 })
    }

    return NextResponse.json(docs)

  } catch (error) {
    console.error("❌ Error fetching vehicle_daily:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}