import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // -------------------------------
    // Query params
    // -------------------------------
    const year = Number(searchParams.get("year"))
    const month = Number(searchParams.get("month"))

    const fleet = searchParams.get("fleet")
    const plant = searchParams.get("plant")
    const supervisor = searchParams.get("supervisor")

    // -------------------------------
    // Mongo
    // -------------------------------
    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("engineon_trip_summary")

    // -------------------------------
    // Match filters (SAFE)
    // -------------------------------
    const match: any = {}
    if (!Number.isNaN(year)) match.year = year
    if (!Number.isNaN(month)) match.month = month
    if (fleet) match["ฟลีท"] = fleet
    if (plant) match["แพล้นท์"] = plant
    if (supervisor) match["Supervisor"] = supervisor

    // -------------------------------
    // Aggregation
    // -------------------------------
    const data = await col
      .aggregate([
        // 1️⃣ Apply filters
        { $match: match },

        // 2️⃣ Normalize date to day (Truck × Day grain)
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

        // 3️⃣ Clean "ส่วนต่าง"
        // - null → null
        // - NaN → null
        {
          $addFields: {
            diff_clean: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$ส่วนต่าง", null] },
                    { $ne: ["$ส่วนต่าง", "$ส่วนต่าง"] }, // NaN check
                  ],
                },
                null,
                "$ส่วนต่าง",
              ],
            },
          },
        },

        // 4️⃣ SLA classification (BUSINESS LOGIC)
        {
          $addFields: {
            sla_status: {
              $cond: [
                { $gt: ["$diff_clean", 0] },
                "over_sla",
                {
                  $cond: [
                    { $eq: ["$diff_clean", null] },
                    "no_data",
                    "within_sla",
                  ],
                },
              ],
            },
          },
        },

        // 5️⃣ Count trucks per day per status
        {
          $group: {
            _id: {
              day: "$day",
              status: "$sla_status",
            },
            truck_count: { $sum: 1 },
          },
        },

        // 6️⃣ Reshape → one row per day
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

        // 7️⃣ Pivot breakdown → columns
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

        // 8️⃣ Sort by day
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
