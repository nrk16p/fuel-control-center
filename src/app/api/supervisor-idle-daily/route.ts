import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get("year"))
    const month = Number(searchParams.get("month"))

    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("engineon_trip_summary")

    const match: any = {
      ส่วนต่าง: { $gt: 0 },
    }

    if (year) match.year = year
    if (month) match.month = month

    const data = await col
      .aggregate([
        { $match: match },

        // normalize date
        {
          $addFields: {
            date_only: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$Date",
                timezone: "Asia/Bangkok",
              },
            },
          },
        },

        // group by Day + Supervisor + Truck
        {
          $group: {
            _id: {
              date: "$date_only",
              supervisor: "$Supervisor",
              truck: "$TruckPlateNo",
            },
            total_diff_min: { $sum: "$ส่วนต่าง" },
            total_trip: { $sum: "$#trip" },
          },
        },

        // group again by Day
        {
          $group: {
            _id: "$_id.date",
            problem_cases: { $sum: 1 }, // supervisor×truck
            supervisors: { $addToSet: "$_id.supervisor" },
            trucks: { $addToSet: "$_id.truck" },
          },
        },

        {
          $project: {
            _id: 0,
            date: "$_id",
            problem_cases: 1,
            supervisor_count: { $size: "$supervisors" },
            truck_count: { $size: "$trucks" },
          },
        },

        { $sort: { date: 1 } },
      ])
      .toArray()

    return NextResponse.json(data)
  } catch (err) {
    console.error("Supervisor idle daily error:", err)
    return NextResponse.json(
      { error: "Failed to load supervisor idle daily" },
      { status: 500 }
    )
  }
}
