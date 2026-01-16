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

    const match: any = {}
    if (year) match.year = Number(year)
    if (month) match.month = Number(month)

    const data = await collection.aggregate([
      // 1) แปลง Date (รองรับทั้ง string และ Date)
      {
        $addFields: {
          DateObj: {
            $cond: [
              { $eq: [{ $type: "$Date" }, "string"] },
              {
                $dateFromString: {
                  dateString: "$Date",
                  timezone: "UTC"
                }
              },
              "$Date"
            ]
          }
        }
      },

      // 2) กรองตาม year & month (ไม่จำกัดวันนี้)
      { $match: match },

      // 3) เลือกฟิลด์ + rename + format วันที่
      {
        $project: {
          _id: 1,

          // rename
          พจส: "$Supervisor",
          TruckNo: "$เลขรถ",

          "#trip": 1,
          version_type: 1,
          TotalMinutes: 1,
          total_engine_on_min_not_plant: 1,
          Duration_str: 1,
          Duration_str_not_plant: 1,
          TruckPlateNo: 1,

          // format วันที่ → DD/MM/YYYY
          Date: {
            $dateToString: {
              format: "%d/%m/%Y",
              date: "$DateObj",
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
          ประเภทยานพาหนะ: 1
        }
      },

      // 4) sort
      { $sort: { Date: -1, TruckPlateNo: 1 } }
    ]).toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("MongoDB Fetch Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch engineon trip summary", detail: String(error) },
      { status: 500 }
    )
  }
}
