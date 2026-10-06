import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { etlJobsQuery } from "@/lib/pipeline-jobs"

// ?job_type=overspeed&limit=5 → the last runs of one job (Jobs tab cards); no params → last 50 of all
export async function GET(req: Request) {
  const { filter, limit } = etlJobsQuery(new URL(req.url).searchParams)
  try {
    const client = await clientPromise
    const db = client.db("analytics")

    const jobs = await db
      .collection("etl_jobs")
      .find(filter)
      .sort({ start_time: -1 })
      .limit(limit)
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
