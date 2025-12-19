import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    /* ---------------- Query params ---------------- */
    const year = Number(searchParams.get("year"))
    const month = Number(searchParams.get("month"))

    const fleet = searchParams.get("fleet")
    const plant = searchParams.get("plant")
    const supervisor = searchParams.get("supervisor")

    /* ---------------- Mongo ---------------- */
    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("engineon_trip_summary")

    /* ---------------- Filters ---------------- */
    const match: any = {}
    if (!Number.isNaN(year)) match.year = year
    if (!Number.isNaN(month)) match.month = month
    if (fleet) match["ฟลีท"] = fleet
    if (plant) match["แพล้นท์"] = plant
    if (supervisor) match["Supervisor"] = supervisor

    /* ---------------- Aggregation ---------------- */
    const data = await col.aggregate([
      { $match: match },

      /* 1️⃣ Normalize day */
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

      /* 2️⃣ Normalize ส่วนต่าง → diff_clean
         - NaN → null
         - non-number → null
      */
      {
        $addFields: {
          diff_clean: {
            $cond: [
              {
                $or: [
                  { $eq: ["$ส่วนต่าง", null] },
                  { $ne: ["$ส่วนต่าง", "$ส่วนต่าง"] }, // NaN trick (MongoDB 4.x safe)
                ],
              },
              null,
              "$ส่วนต่าง",
            ],
          },
        },
      },

      /* 3️⃣ SLA classification */
      {
        $addFields: {
          sla_status: {
            $cond: [
              { $eq: ["$diff_clean", null] },
              "no_data",
              {
                $cond: [
                  { $gt: ["$diff_clean", 0] },
                  "over_sla",
                  "within_sla",
                ],
              },
            ],
          },
        },
      },

      /* 4️⃣ Count per day */
      {
        $group: {
          _id: { day: "$day", status: "$sla_status" },
          truck_count: { $sum: 1 },
        },
      },

      /* 5️⃣ Pivot */
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
