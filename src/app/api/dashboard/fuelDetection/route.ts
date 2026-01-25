import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"


export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const yearsParam = searchParams.get("years") 
    const monthParam = searchParams.get("month") 
    const plate = searchParams.get("plate")

    const years = yearsParam
      ? yearsParam.split(',').map(y => parseInt(y.trim())).filter(y => !isNaN(y))
      : [new Date().getFullYear()]

      // monthParam = 1,2,3,4,5,6,7,8,9,10,11,12
    const months = monthParam
      ? monthParam.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m) && m >= 1 && m <= 12)
      : []

    const client = await clientPromise
    const db = client.db("analytics")
    const col = db.collection("fuel_drop_reviews")

    // Build date range for selected years and months
    let dateQueries = []
    
    if (months.length > 0) {
      for (const year of years) {
        for (const month of months) {
          const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0)
          const endDate = new Date(year, month, 0, 23, 59, 59, 999)
          dateQueries.push({
            created_at: {
              $gte: startDate,
              $lte: endDate
            }
          })
        }
      }
    } else {
      dateQueries = years.map(year => ({
        created_at: {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lte: new Date(`${year}-12-31T23:59:59.999Z`)
        }
      }))
    }

    const data = await col
      .find({
        $or: dateQueries,
        plate: plate ? { $regex: plate, $options: "i" } : { $exists: true },
      })
      .sort({ created_at: -1 })
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("❌ GET fuel detection error:", error)
    return NextResponse.json(
      { error: "Failed to fetch fuel detection data" },
      { status: 500 }
    )
  }
}