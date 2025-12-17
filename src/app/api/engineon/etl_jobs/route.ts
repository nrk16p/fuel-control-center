import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const year = searchParams.get("year")
    const month = searchParams.get("month")
    const jobType =
      searchParams.get("job_type") ?? "engineon_trip_summary"
    const latest = searchParams.get("latest") === "true"

    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("etl_jobs")

    /* ---------------- Query ---------------- */
    const query: any = { job_type: jobType }

    if (year) query.year = Number(year)
    if (month) query.month = Number(month)

    /* ---------------- Fetch ---------------- */
    let cursor = col.find(query).sort({ end_time: -1 })

    if (latest) {
      const job = await cursor.limit(1).next()
      return NextResponse.json(job)
    }

    const jobs = await cursor.limit(50).toArray()

    return NextResponse.json(jobs)
  } catch (err) {
    console.error("❌ ETL Job Fetch Error:", err)
    return NextResponse.json(
      { error: "Failed to fetch etl jobs" },
      { status: 500 }
    )
  }
}
