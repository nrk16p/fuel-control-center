import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    const client = await clientPromise
    const db = client.db("analytics")
    const collection = db.collection("engineon_trip_summary")

    const today = new Date()
    const startOfDay = new Date(today.setHours(0, 0, 0, 0))
    const endOfDay = new Date(today.setHours(23, 59, 59, 999))

    const match: any = {
      Date: { $gte: startOfDay, $lte: endOfDay }   // ✅ เฉพาะ "วันนี้"
    }

    if (year) match.year = Number(year)
    if (month) match.month = Number(month)

    const data = await collection.aggregate([
      { $match: match },

      {
        $project: {
          _id: 1,
          "พจส.": "$Supervisor",
          "#trip": 1,
          version_type: 1,
          TotalMinutes: 1,
          total_engine_on_min_not_plant: 1,
          Duration_str: 1,
          Duration_str_not_plant: 1,
          TruckPlateNo: 1,

          // ✅ แปลง Date → 01/12/2025
          Date: {
            $dateToString: {
              format: "%d/%m/%Y",
              date: "$Date",
              timezone: "Asia/Bangkok"
            }
          },

          สำรองเวลาโหลด: 1,
          ส่วนต่าง: 1,
          ส่วนต่าง_hhmm: 1,
          จำนวนลิตร: 1,
          not_plant_minutes: 1,
          not_plant_hhmm: 1,
          not_plant_liter: 1,
          year: 1,
          month: 1,
         TruckNo: "$เลขรถ",
          ประเภทยานพาหนะ: 1
        }
      },

      { $sort: { TruckPlateNo: 1 } }
    ]).toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("MongoDB Fetch Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch engineon trip summary" },
      { status: 500 }
    )
  }
}
