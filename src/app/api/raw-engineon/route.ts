import clientPromise from "@/lib/mongodb"
import { NextResponse } from "next/server"

/**
 * 🔍 GET /api/raw-engineon?id=71-8623_2025-12-01
 * 
 * Supports matching both:
 *   - exact IDs: "71-8623_2025-12-01"
 *   - suffixed IDs: "71-8623_2025-12-01_1", "71-8623_2025-12-01_2", etc.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    // 🧩 Validate query parameter
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    // 🗄️ Connect to MongoDB
    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("raw_engineon")

    // ✅ Create regex that matches both base id and numbered suffixes
    // Example: id="71-8623_2025-12-01" → matches "71-8623_2025-12-01_1"
    const pattern = `^${id}(_\\d+)?$`

    // ✅ Use string-based $regex with $options for case-insensitive match
    const docs = await collection
      .find({ _id: { $regex: pattern, $options: "i" } })
      .toArray()

    // 📭 Handle no results
    if (!docs || docs.length === 0) {
      return NextResponse.json([], { status: 404 })
    }

    // ✅ Return all matched documents
    return NextResponse.json(docs)
  } catch (error) {
    console.error("❌ Error fetching raw_engineon:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
