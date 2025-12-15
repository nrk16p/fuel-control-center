import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("raw_engineon")

    // ✅ Match both formats:
    // "71-8623_2025-12-01" and "71-8623_2025-12-01_1", "71-8623_2025-12-01_2", etc.
    const regex = new RegExp(`^${id}(_\\d+)?$`, "i")

    const docs = await collection.find({ _id: { $regex: regex } }).toArray()

    if (docs.length === 0) {
      return NextResponse.json([], { status: 404 })
    }

    return NextResponse.json(docs)
  } catch (error) {
    console.error("Error fetching raw_engineon:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
