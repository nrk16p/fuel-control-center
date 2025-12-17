import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET() {
  try {
    const client = await clientPromise
    const db = client.db("analytics")

    const jobs = await db
      .collection("etl_jobs")
      .find({})
      .sort({ start_time: -1 })
      .limit(50)
      .toArray()

    return NextResponse.json(jobs)
  } catch (err) {
    console.error("ETL JOBS FETCH ERROR:", err)
    return NextResponse.json(
      { error: "Failed to fetch ETL jobs" },
      { status: 500 }
    )
  }
}
