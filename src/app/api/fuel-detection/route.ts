import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { toDateFromThai, overlap } from "@/lib/dt-th"

function sampleDataEvery5Minutes(data: any[]) {
  if (data.length === 0) return data

  const timeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0
    const [h, m, s] = timeStr.split(":").map(Number)
    return h * 60 + m + Math.round((s || 0) / 60)
  }

  const groupedByDate: Record<string, any[]> = {}
  data.forEach(item => {
    const date = item["วันที่"]
    if (!groupedByDate[date]) groupedByDate[date] = []
    groupedByDate[date].push(item)
  })

  const sampled: any[] = []
  Object.values(groupedByDate).forEach(dayData => {
    dayData.sort((a, b) => timeToMinutes(a["เวลา"]) - timeToMinutes(b["เวลา"]))
    let lastBucket = -1
    dayData.forEach(item => {
      const minute = timeToMinutes(item["เวลา"])
      const bucket = Math.floor(minute / 5) * 5
      if (bucket !== lastBucket) {
        sampled.push(item)
        lastBucket = bucket
      }
    })
  })

  return sampled
}

function toTs(row: any) {
  const dt = toDateFromThai(row["วันที่"], row["เวลา"])
  return dt ? dt.getTime() : null
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams

    const plateDriver = params.get("plateDriver")?.trim() || ""
    const startDate = params.get("startDate") || ""
    const endDate = params.get("endDate") || ""

    const statusesParam = params.get("statuses")
    const statuses = statusesParam
      ? statusesParam.split(",").map(s => s.trim()).filter(Boolean)
      : []

    const movingOnly = params.get("movingOnly") === "true"

    // ✅ NEW UX: default = false (ไม่ซ่อน)
    const skipReviewed = params.get("skipReviewed") === "true"

    const client = await clientPromise
    const db = client.db("terminus")

    const query: any = {}
    if (startDate && endDate) query["วันที่"] = { $gte: startDate, $lte: endDate }
    else if (startDate) query["วันที่"] = { $gte: startDate }
    else if (endDate) query["วันที่"] = { $lte: endDate }

    if (plateDriver) query["ทะเบียนพาหนะ"] = plateDriver
    if (statuses.length > 0) query["สถานะ"] = { $in: statuses }

    let jobs = await db
      .collection("driving_log")
      .find(query)
      .sort({ "วันที่": 1, "เวลา": 1 })
      .toArray()

    if (jobs.length > 0) jobs = sampleDataEvery5Minutes(jobs)

    if (movingOnly) {
      jobs = jobs.filter(j => Number(j["ความเร็ว(กม./ชม.)"] ?? 0) > 0)
    }

    // ✅ optional: hide reviewed points
    if (skipReviewed && plateDriver && startDate && endDate) {
      const wStart = toDateFromThai(startDate, "00:00:00")
      const wEnd = toDateFromThai(endDate, "23:59:59")
      if (wStart && wEnd) {
        const adb = client.db("analytics")
        const reviews = await adb
          .collection("fuel_drop_reviews")
          .find({
            plate: plateDriver,
            start_ts: { $lte: wEnd.getTime() },
            end_ts: { $gte: wStart.getTime() },
          })
          .project({ start_ts: 1, end_ts: 1 })
          .toArray()

        const windows = reviews.map(r => [Number(r.start_ts), Number(r.end_ts)] as const)

        jobs = jobs.filter(row => {
          const ts = toTs(row)
          if (ts == null) return true
          for (const [a, b] of windows) {
            if (overlap(ts, ts, a, b)) return false
          }
          return true
        })
      }
    }

    return NextResponse.json(jobs)
  } catch (err) {
    console.error("FUEL DETECTION FETCH ERROR:", err)
    return NextResponse.json({ error: "Failed to fetch fuel detection data" }, { status: 500 })
  }
}
