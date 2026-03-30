import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

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
    // 📅 daysAgo
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

      filter["วันที่"] = { $in: dateList }
    }

    // ================================
    // 🔍 keyword (search all important fields)
    // ================================
    if (keyword) {
      filter["$or"] = [
        { LDT: { $regex: keyword, $options: "i" } },
        { "ทะเบียนหัว": { $regex: keyword, $options: "i" } },
        { "แพล้นท์": { $regex: keyword, $options: "i" } },
        { "บริการ": { $regex: keyword, $options: "i" } }
      ]
    }

    console.log("🧠 FILTER:", filter)

    // ================================
    // 🚀 QUERY (NO projection)
    // ================================
    const docs = await collection
      .find(filter) // 🔥 เอาทุก field
      .sort({ updated_at: -1 })
      .limit(1000) // กัน data ระเบิด
      .toArray()

    return NextResponse.json(docs)

  } catch (error) {
    console.error("❌ processed_ldf error:", error)
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}