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
    const daysAgo = searchParams.get("daysAgo")

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

    // 🚚 plate (ใช้ field จริง)
    if (plate) {
      filter["ทะเบียนหัว"] = { $regex: plate, $options: "i" }
    }

    // 🧠 client
    if (client) {
      filter["client"] = client
    }

    // ================================
    // 📅 DATE FILTER (FIXED)
    // ================================

    // 🔥 daysAgo (priority สูงสุด)
    if (daysAgo) {
      const d = new Date()
      d.setDate(d.getDate() - parseInt(daysAgo))

      const dd = String(d.getDate()).padStart(2, "0")
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const yyyy = d.getFullYear()

      const dateStr = `${dd}/${mm}/${yyyy}`

      filter["วันที่"] = dateStr   // ✅ ใช้ string match
    }

    // 🔥 fallback: start_date / end_date (string range)
    else if (start_date || end_date) {
      filter["วันที่"] = {}

      if (start_date) {
        const d = new Date(start_date)
        const dd = String(d.getDate()).padStart(2, "0")
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const yyyy = d.getFullYear()

        filter["วันที่"]["$gte"] = `${dd}/${mm}/${yyyy}`
      }

      if (end_date) {
        const d = new Date(end_date)
        const dd = String(d.getDate()).padStart(2, "0")
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const yyyy = d.getFullYear()

        filter["วันที่"]["$lte"] = `${dd}/${mm}/${yyyy}`
      }
    }

    // 🔍 keyword
    if (keyword) {
      filter["$or"] = [
        { LDT: { $regex: keyword, $options: "i" } },
        { "ทะเบียนหัว": { $regex: keyword, $options: "i" } },
        { "แพล้นท์": { $regex: keyword, $options: "i" } }
      ]
    }

    console.log("🧠 FILTER:", filter)

    // ================================
    // 🚀 QUERY ALL
    // ================================
    const docs = await collection
      .find(filter, {
        projection: {
          _id: 0,
          LDT: 1,
          "ทะเบียนหัว": 1,
          "แพล้นท์": 1,
          "ชื่อไซร้งาน": 1,
          Quantity: 1,
          plan_distance: 1,
          PlantToSiteDistance: 1,
          "วันที่": 1,
          client: 1
        }
      })
      .sort({ "วันที่": -1 })
      .toArray()

    // ================================
    // 🧠 CLEAN
    // ================================
    const data = docs.map((d: any) => ({
      ticket_no: d.LDT,
      plate: d["ทะเบียนหัว"],
      plant: d["แพล้นท์"],
      site: d["ชื่อไซร้งาน"],
      qty: d.Quantity,
      distance_plan: Number(d.plan_distance || 0),
      distance_actual: Number(d.PlantToSiteDistance || 0),
      date: d["วันที่"],
      client: d.client
    }))

    return NextResponse.json(data)

  } catch (error) {
    console.error("❌ processed_ldf error:", error)
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}