import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const year = Number(searchParams.get("year"))
    const month = Number(searchParams.get("month"))

    const fleet = searchParams.get("fleet")
    const plant = searchParams.get("plant")
    const vehicleType = searchParams.get("vehicle_type")
    const supervisor = searchParams.get("supervisor")

    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("engineon_trip_summary")

    const match: any = {}
    if (year) match.year = year
    if (month) match.month = month
    if (fleet) match["ฟลีท"] = fleet
    if (plant) match["แพล้นท์"] = plant
    if (vehicleType) match["ประเภทยานพาหนะ"] = vehicleType
    if (supervisor) match["Supervisor"] = supervisor

    const data = await col.aggregate([
      { $match: match },

      // normalize day
      {
        $addFields: {
          day: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$Date",
              timezone: "Asia/Bangkok",
            },
          },
        },
      },

      // SLA classification
      {
        $addFields: {
          sla_status: {
            $cond: [
              { $gt: ["$ส่วนต่าง", 0] },
              "over_sla",
              {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$ส่วนต่าง", null] },
                      { $not: ["$ส่วนต่าง"] },
                    ],
                  },
                  "no_data",
                  "within_sla",
                ],
              },
            ],
          },
        },
      },

      // count per day
      {
        $group: {
          _id: { day: "$day", status: "$sla_status" },
          truck_count: { $sum: 1 },
        },
      },

      {
        $group: {
          _id: "$_id.day",
          total_trucks: { $sum: "$truck_count" },
          breakdown: {
            $push: {
              status: "$_id.status",
              count: "$truck_count",
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          day: "$_id",
          total_trucks: 1,
          over_sla: {
            $sum: {
              $map: {
                input: "$breakdown",
                as: "b",
                in: {
                  $cond: [
                    { $eq: ["$$b.status", "over_sla"] },
                    "$$b.count",
                    0,
                  ],
                },
              },
            },
          },
          within_sla: {
            $sum: {
              $map: {
                input: "$breakdown",
                as: "b",
                in: {
                  $cond: [
                    { $eq: ["$$b.status", "within_sla"] },
                    "$$b.count",
                    0,
                  ],
                },
              },
            },
          },
          no_data: {
            $sum: {
              $map: {
                input: "$breakdown",
                as: "b",
                in: {
                  $cond: [
                    { $eq: ["$$b.status", "no_data"] },
                    "$$b.count",
                    0,
                  ],
                },
              },
            },
          },
        },
      },

      { $sort: { day: 1 } },
    ]).toArray()

    return NextResponse.json(data)
  } catch (err) {
    console.error("Idle daily breakdown error:", err)
    return NextResponse.json(
      { error: "Failed to load idle daily breakdown" },
      { status: 500 }
    )
  }
}
