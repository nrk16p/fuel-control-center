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

    // 🚚 plate
    if (plate) {
      filter["ทะเบียนหัว"] = { $regex: plate, $options: "i" }
    }

    // 🧠 client
    if (client) {
      filter["client"] = client
    }

    // ================================
    // 📅 DATE FILTER (IMPORTANT FIX)
    // ================================
    if (daysAgo) {
      const d = new Date()
      d.setDate(d.getDate() - parseInt(daysAgo))

      const dd = String(d.getDate()).padStart(2, "0")
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const yyyy = d.getFullYear()

      const dateStr = `${dd}/${mm}/${yyyy}`

      // 🔥 ใช้ regex กัน case format ไม่ตรง / space
      filter["วันที่"] = {
        $regex: `^${dateStr}`,
        $options: "i"
      }
    }

    // 🔥 fallback: range
    else if (start_date || end_date) {
      const buildDateStr = (dateStr: string) => {
        const d = new Date(dateStr)
        const dd = String(d.getDate()).padStart(2, "0")
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const yyyy = d.getFullYear()
        return `${dd}/${mm}/${yyyy}`
      }

      filter["วันที่"] = {}

      if (start_date) {
        filter["วันที่"]["$gte"] = buildDateStr(start_date)
      }

      if (end_date) {
        filter["วันที่"]["$lte"] = buildDateStr(end_date)
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
    // 🚀 QUERY ALL DATA
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
      .sort({ updated_at: -1 }) // 🔥 ล่าสุดก่อน
      .toArray()

    // ================================
    // 🧠 CLEAN RESPONSE
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