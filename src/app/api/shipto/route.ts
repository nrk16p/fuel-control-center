import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // ================================
    // 🎯 PARAMS
    // ================================
    const ship_to_code = searchParams.get("ship_to_code")
    const customer_id = searchParams.get("customer_id")
    const province = searchParams.get("province")
    const name = searchParams.get("name")
    const is_active = searchParams.get("is_active")

    // pagination
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    // ================================
    // 🧠 CONNECT MONGO
    // ================================
    const client = await clientPromise
    const db = client.db("atms")
    const collection = db.collection("shipto")

    // ================================
    // 🧠 BUILD FILTER
    // ================================
    const filter: any = {}

    // ship_to_code
    if (ship_to_code) {
      filter["ship_to_code"] = ship_to_code
    }

    // ✅ customer_id (รองรับหลายค่า)
    const customerParams = searchParams.getAll("customer_id")

    if (customerParams.length > 0) {
      filter["customer_id"] = { $in: customerParams }
    } else if (customer_id) {
      const customerList = customer_id.split(",").map(v => v.trim())
      filter["customer_id"] = { $in: customerList }
    }

    // จังหวัด
    if (province) {
      filter["จังหวัด"] = { $regex: province, $options: "i" }
    }

    // ชื่อ
    if (name) {
      filter["ชื่อ"] = { $regex: name, $options: "i" }
    }

    // is_active
    if (is_active !== null) {
      filter["is_active"] = is_active === "true"
    }

    // ================================
    // 🚀 QUERY
    // ================================
    const cursor = collection
      .find(filter, {
        projection: {
          _id: 0,
          ship_to_code: 1,
          customer_id: 1,
          ชื่อ: 1,
          จังหวัด: 1,
          ระยะทาง: 1,
          สภาพการจราจร: 1,
          is_active: 1,
          updated_at: 1
        }
      })
      .sort({ updated_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const docs = await cursor.toArray()

    // ================================
    // 🧠 CLEAN RESPONSE
    // ================================
    const result = docs.map((d: any) => ({
      ship_to_code: d.ship_to_code,
      customer_id: d.customer_id,
      name: d["ชื่อ"],
      province: d["จังหวัด"],
      distance: Number(d["ระยะทาง"] || 0),
      traffic: d["สภาพการจราจร"],
      is_active: d.is_active,
      updated_at: d.updated_at
    }))

    // ================================
    // 📊 COUNT (optional)
    // ================================
    const total = await collection.countDocuments(filter)

    return NextResponse.json({
      data: result,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error("❌ Error fetching shipto:", error)
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}