import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    // 🧠 Connect to MongoDB
    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("raw_engineon")

    // Summary _id may carry a dedup suffix (_d1, _d2, ...) when the same
    // truck/date has multiple drivers — strip it before matching raw docs
    const baseId = id.replace(/_d\d+$/, "")

    // ✅ Regex pattern to match both formats: _1, _2, etc.
    const pattern = new RegExp(`^${baseId}(_\\d+)?$`, "i")

    /**
     * ✅ The MongoDB Node driver’s `Filter` type is too strict for RegExp,
     * so we explicitly cast this filter to `any` for compatibility.
     */
    const filter: any = { _id: { $regex: pattern } }

    const docs = await collection.find(filter).toArray()

    if (!docs || docs.length === 0) {
      return NextResponse.json([], { status: 404 })
    }

    return NextResponse.json(docs)
  } catch (error) {
    console.error("❌ Error fetching raw_engineon:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
