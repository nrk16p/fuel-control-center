import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

// ================================
// 🧠 helper: format dd/mm/yyyy
// ================================
function formatDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const plate = searchParams.get("plate")
    const client = searchParams.get("client")
    const keyword = searchParams.get("keyword")

    const start_date = searchParams.get("start_date")
    const end_date = searchParams.get("end_date")
    const daysAgo = searchParams.get("daysAgo")

    const mongo = await clientPromise
    const db = mongo.db("analytics")
    const collection = db.collection("processed_ldf")

    const filter: any = {}

    // ================================
    // 🚚 plate
    // ================================
    if (plate) {
      filter["ทะเบียนหัว"] = { $regex: plate.trim(), $options: "i" }
    }

    // ================================
    // 🧠 client
    // ================================
    if (client) {
      filter["client"] = client
    }

    // ================================
    // 📅 DATE FILTER (FIXED)
    // ================================
    if (daysAgo) {
      const days = parseInt(daysAgo)

      const today = new Date()
      const dateList: string[] = []

      for (let i = 0; i <= days; i++) {
        const d = new Date()
        d.setDate(today.getDate() - i)
        dateList.push(formatDate(d))
      }

      // 🔥 match หลายวัน
      filter["วันที่"] = {
        $in: dateList
      }
    }

    // ================================
    // 📅 RANGE (fallback)
    // ================================
    else if (start_date || end_date) {
      const dateList: string[] = []

      const start = start_date ? new Date(start_date) : new Date()
      const end = end_date ? new Date(end_date) : new Date()

      let current = new Date(start)

      while (current <= end) {
        dateList.push(formatDate(current))
        current.setDate(current.getDate() + 1)
      }

      filter["วันที่"] = { $in: dateList }
    }

    // ================================
    // 🔍 keyword
    // ================================
    if (keyword) {
      filter["$or"] = [
        { LDT: { $regex: keyword, $options: "i" } },
        { "ทะเบียนหัว": { $regex: keyword, $options: "i" } },
        { "แพล้นท์": { $regex: keyword, $options: "i" } }
      ]
    }

    console.log("🧠 FILTER:", filter)

    // ================================
    // 🚀 QUERY
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
          client: 1,
          updated_at: 1
        }
      })
      .sort({ updated_at: -1 })
      .toArray()

    // ================================
    // 🧠 CLEAN
    // ================================
    const data = docs.map((d: any) => ({
      ticket_no: d.LDT,
      plate: (d["ทะเบียนหัว"] || "").trim(),
      plant: d["แพล้นท์"],
      site: d["ชื่อไซร้งาน"],
      qty: d.Quantity || 0,
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