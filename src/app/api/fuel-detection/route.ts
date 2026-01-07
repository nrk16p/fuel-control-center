import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { toDateFromThai, overlap } from "@/lib/dt-th"

/* -------------------------------------------------
   Convert row to timestamp (for review overlap only)
------------------------------------------------- */
function toTs(row: any) {
  const dt = toDateFromThai(row["วันที่"], row["เวลา"])
  return dt ? dt.getTime() : null
}

/* -------------------------------------------------
   Build list of "DD/MM/YYYY" strings between start-end (inclusive)
   ✅ Fix for string-date comparison issue in Mongo
------------------------------------------------- */
function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function fmtThaiDateDDMMYYYY(d: Date) {
  const dd = pad2(d.getDate())
  const mm = pad2(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function buildDateListDDMMYYYY(startDate: string, endDate: string) {
  const s = toDateFromThai(startDate, "00:00:00")
  const e = toDateFromThai(endDate, "00:00:00")
  if (!s || !e) return []

  // ensure s <= e
  const start = s.getTime() <= e.getTime() ? s : e
  const end = s.getTime() <= e.getTime() ? e : s

  const out: string[] = []
  const cur = new Date(start)
  cur.setHours(0, 0, 0, 0)
  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)

  while (cur.getTime() <= endDay.getTime()) {
    out.push(fmtThaiDateDDMMYYYY(cur))
    cur.setDate(cur.getDate() + 1)
  }

  return out
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams

    const plateDriver = params.get("plateDriver")?.trim() || ""
    const startDate = params.get("startDate") || "" // DD/MM/YYYY
    const endDate = params.get("endDate") || ""     // DD/MM/YYYY

    const statusesParam = params.get("statuses")
    const statuses = statusesParam
      ? statusesParam.split(",").map(s => s.trim()).filter(Boolean)
      : []

    const movingOnly = params.get("movingOnly") === "true"

    // default = false (ไม่ซ่อน)
    const skipReviewed = params.get("skipReviewed") === "true"

    const client = await clientPromise
    const db = client.db("terminus")

    const query: any = {}

    /* -------------------------------------------------
       ✅ ACCURACY: Do NOT use $gte/$lte on "DD/MM/YYYY" string
       Use exact date list only (prevents year 2026 leaking)
    ------------------------------------------------- */
    if (startDate && endDate) {
      const dateList = buildDateListDDMMYYYY(startDate, endDate)
      if (dateList.length > 0) {
        query["วันที่"] = { $in: dateList }
      }
    } else if (startDate) {
      query["วันที่"] = startDate
    } else if (endDate) {
      query["วันที่"] = endDate
    }

    if (plateDriver) query["ทะเบียนพาหนะ"] = plateDriver
    if (statuses.length > 0) query["สถานะ"] = { $in: statuses }

    /* -------------------------------------------------
       🔴 NO SAMPLING: fetch raw points only (visual layer)
    ------------------------------------------------- */
    let jobs = await db
      .collection("driving_log")
      .find(query)
      .sort({ "วันที่": 1, "เวลา": 1 })
      .toArray()

    if (movingOnly) {
      jobs = jobs.filter(j => Number(j["ความเร็ว(กม./ชม.)"] ?? 0) > 0)
    }

    /* -------------------------------------------------
       Optional: hide reviewed points (visual only)
       Business truth remains in fuel_drop_reviews
    ------------------------------------------------- */
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
    return NextResponse.json(
      { error: "Failed to fetch fuel detection data" },
      { status: 500 }
    )
  }
}
