import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    /* -------------------------------------------------
       Query params
    ------------------------------------------------- */
    const year = Number(searchParams.get("year"))
    const month = Number(searchParams.get("month"))

    const fleet = searchParams.get("fleet")
    const plant = searchParams.get("plant")
    const supervisor = searchParams.get("supervisor")

    /* -------------------------------------------------
       Mongo
    ------------------------------------------------- */
    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("engineon_trip_summary")

    /* -------------------------------------------------
       Match filters (SAFE)
    ------------------------------------------------- */
    const match: any = {}
    if (!Number.isNaN(year)) match.year = year
    if (!Number.isNaN(month)) match.month = month
    if (fleet) match["ฟลีท"] = fleet
    if (plant) match["แพล้นท์"] = plant
    if (supervisor) match["Supervisor"] = supervisor

    /* -------------------------------------------------
       Aggregation Pipeline
    ------------------------------------------------- */
    const data = await col
      .aggregate([
        /* 1️⃣ Apply filters */
        { $match: match },

        /* 2️⃣ Normalize date → Day level (Truck × Day grain) */
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

        /* 3️⃣ SLA classification (CORRECT LOGIC) */
        {
          $addFields: {
            sla_status: {
              $switch: {
                branches: [
                  // 🔹 Case 1: not a number at all → no_data
                  {
                    case: { $not: [{ $isNumber: "$ส่วนต่าง" }] },
                    then: "no_data",
                  },

                  // 🔹 Case 2: number but NaN → no_data
                  {
                    case: { $isNaN: "$ส่วนต่าง" },
                    then: "no_data",
                  },

                  // 🔹 Case 3: over SLA
                  {
                    case: { $gt: ["$ส่วนต่าง", 0] },
                    then: "over_sla",
                  },
                ],

                // 🔹 Case 4: valid number ≤ 0
                default: "within_sla",
              },
            },
          },
        },

        /* 4️⃣ Count trucks per day per SLA status */
        {
          $group: {
            _id: {
              day: "$day",
              status: "$sla_status",
            },
            truck_count: { $sum: 1 },
          },
        },

        /* 5️⃣ Reshape → one row per day */
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

        /* 6️⃣ Pivot SLA status → columns */
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

        /* 7️⃣ Sort by day */
        { $sort: { day: 1 } },
      ])
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("Idle daily breakdown API error:", error)
    return NextResponse.json(
      { error: "Failed to load idle daily breakdown" },
      { status: 500 }
    )
  }
}
