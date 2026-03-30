import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // ================================
    // 🎯 PARAMS
    // ================================
    const plate = searchParams.get("plate")
    const branch = searchParams.get("branch")
    const type = searchParams.get("type")
    const project = searchParams.get("project")
    const keyword = searchParams.get("keyword")

    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    // ================================
    // 🧠 CONNECT
    // ================================
    const mongo = await clientPromise
    const db = mongo.db("atms")
    const collection = db.collection("vehiclemaster")

    // ================================
    // 🧠 BUILD FILTER
    // ================================
    const filter: any = {}

    // 🚚 plate
    if (plate) {
      filter["ทะเบียน"] = { $regex: plate, $options: "i" }
    }

    // 🏢 branch
    if (branch) {
      filter["สาขา"] = branch
    }

    // 🚛 type
    if (type) {
      filter["ประเภทยานพาหนะ"] = type
    }

    // 📦 project
    if (project) {
      filter["โปรเจค"] = { $regex: project, $options: "i" }
    }

    // 🔍 keyword
    if (keyword) {
      filter["$or"] = [
        { "ทะเบียน": { $regex: keyword, $options: "i" } },
        { "ยี่ห้อ": { $regex: keyword, $options: "i" } },
        { "ประเภทยานพาหนะ": { $regex: keyword, $options: "i" } },
        { "โปรเจค": { $regex: keyword, $options: "i" } }
      ]
    }

    // ================================
    // 🚀 QUERY
    // ================================
    const cursor = collection
      .find(filter, {
        projection: {
          _id: 0,
          ทะเบียน: 1,
          เลขรถ: 1,
          สาขา: 1,
          ยี่ห้อ: 1,
          ประเภทยานพาหนะ: 1,
          โปรเจค: 1,
          แพล้นท์: 1,
          ปี: 1,
          น้ำหนัก: 1,
          เป็นหาง: 1,
          มีปัมป์: 1
        }
      })
      .skip((page - 1) * limit)
      .limit(limit)

    const docs = await cursor.toArray()

    // ================================
    // 🧠 CLEAN DATA
    // ================================
    const clean = (val: any) =>
      val === "nan" || val === "-" ? null : val

    const data = docs.map((d: any) => ({
      plate: d["ทะเบียน"],
      truck_no: clean(d["เลขรถ"]),
      branch: clean(d["สาขา"]),
      brand: clean(d["ยี่ห้อ"]),
      type: clean(d["ประเภทยานพาหนะ"]),
      project: clean(d["โปรเจค"]),
      plant: clean(d["แพล้นท์"]),
      year: Number(d["ปี"] || 0),
      weight: Number(d["น้ำหนัก"] || 0),
      is_trailer: d["เป็นหาง"] === "1",
      has_pump: d["มีปัมป์"] === "1"
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
    console.error("❌ vehiclemaster error:", error)
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}