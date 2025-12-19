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

    const match: any = {}
    if (!Number.isNaN(year)) match.year = year
    if (!Number.isNaN(month)) match.month = month

    const data = await col.aggregate([
      { $match: match },

      // 1️⃣ Day level
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

      // 2️⃣ SAFE normalize ส่วนต่าง
      {
        $addFields: {
          diff_num: {
            $convert: {
              input: "$ส่วนต่าง",
              to: "double",
              onError: null,
              onNull: null,
            },
          },
        },
      },

      // 3️⃣ SLA classification (100% reliable)
      {
        $addFields: {
          sla_status: {
            $cond: [
              { $eq: ["$diff_num", null] },
              "no_data",
              {
                $cond: [
                  { $gt: ["$diff_num", 0] },
                  "over_sla",
                  "within_sla",
                ],
              },
            ],
          },
        },
      },

      // 4️⃣ Count
      {
        $group: {
          _id: { day: "$day", status: "$sla_status" },
          truck_count: { $sum: 1 },
        },
      },

      // 5️⃣ Pivot
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
  } catch (error) {
    console.error("Idle daily breakdown API error:", error)
    return NextResponse.json(
      { error: "Failed to load idle daily breakdown" },
      { status: 500 }
    )
  }
}
