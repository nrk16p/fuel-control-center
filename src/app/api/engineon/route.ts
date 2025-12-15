import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET() {
  try {
    const client = await clientPromise
    const db = client.db("analytics")              // ✅ correct DB
    const collection = db.collection("summary_engineon") // ✅ correct collection name

    const data = await collection
      .find({})
      .sort({ _id: -1 })
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("MongoDB Fetch Error:", error)
    return NextResponse.json({ error: "Failed to fetch engine data" }, { status: 500 })
  }
}
