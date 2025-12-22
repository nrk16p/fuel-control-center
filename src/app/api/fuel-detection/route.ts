import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

/* ======================================================
   Helper: Sample data every 5 minutes (ของเดิม)
====================================================== */
function sampleDataEvery5Minutes(data: any[]) {
  if (data.length === 0) return data

  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes, seconds] = timeStr.split(":").map(Number)
    return hours * 60 + minutes + Math.round((seconds || 0) / 60)
  }

  const groupedByDate: Record<string, any[]> = {}

  data.forEach(item => {
    const date = item["วันที่"]
    if (!groupedByDate[date]) groupedByDate[date] = []
    groupedByDate[date].push(item)
  })

  const sampledData: any[] = []

  Object.values(groupedByDate).forEach(dayData => {
    dayData.sort(
      (a, b) => timeToMinutes(a["เวลา"]) - timeToMinutes(b["เวลา"])
    )

    let lastSampledMinute = -1

    dayData.forEach(item => {
      const currentMinute = timeToMinutes(item["เวลา"])
      const roundedMinute = Math.floor(currentMinute / 5) * 5

      if (roundedMinute !== lastSampledMinute) {
        sampledData.push(item)
        lastSampledMinute = roundedMinute
      }
    })
  })

  return sampledData
}

/* ======================================================
   API
====================================================== */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams

    const plateDriver = params.get("plateDriver") || ""
    const startDate = params.get("startDate") || ""
    const endDate = params.get("endDate") || ""
    const status = params.get("status") || "all"   // ✅ เพิ่ม

    const client = await clientPromise
    const db = client.db("terminus")

    const query: any = {}

    // 📅 Date filter
    if (startDate && endDate) {
      query["วันที่"] = { $gte: startDate, $lte: endDate }
    } else if (startDate) {
      query["วันที่"] = { $gte: startDate }
    } else if (endDate) {
      query["วันที่"] = { $lte: endDate }
    }

    // 🚗 Plate filter
    if (plateDriver) {
      query["ทะเบียนพาหนะ"] = plateDriver
    }

    // ✅ Status filter (ใช้ field ที่มีอยู่แล้ว)
    // เช่น รถวิ่ง / ดับเครื่อง / จอด / เดินเครื่อง
    if (status !== "all") {
      query["สถานะ"] = status
    }

    console.log("MongoDB Query:", query)

    let jobs = await db
      .collection("driving_log")
      .find(query)
      .sort({ "วันที่": 1, "เวลา": 1 })
      .toArray()

    // ⏱️ Sampling ทุก 5 นาที
    if (jobs.length > 0) {
      const originalLength = jobs.length
      jobs = sampleDataEvery5Minutes(jobs)
      console.log(
        `Data sampled every 5 minutes. Original: ${originalLength}, Sampled: ${jobs.length}`
      )
    }

    console.log("Fetched Jobs:", jobs.length)

    return NextResponse.json(jobs)
  } catch (err) {
    console.error("ETL JOBS FETCH ERROR:", err)
    return NextResponse.json(
      { error: "Failed to fetch ETL jobs" },
      { status: 500 }
    )
  }
}
