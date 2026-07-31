import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"

/* ============================================================================
   GET – list plants (optional filter by client)
   GET /api/driver
   GET /api/drivers?month=xx&year=xxxx
============================================================================ */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const month = Number(searchParams.get("month"))
    const year = Number(searchParams.get("year"))

    // console.log("GET month, year:", month, year)

    const client = await clientPromise
    const db = client.db("atms")
    const col = db.collection("drivers_risk")

    const data = await col
      .find({
        month,
        year,
      })
      .sort({ driver: 1 })
      .toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("❌ GET drivers error:", error)
    return NextResponse.json(
      { error: "Failed to fetch drivers" },
      { status: 500 }
    )
  }
}
/* ============================================================================
   POST – create new plant
   POST /api/plants
============================================================================ */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { driver, month, year } = body

    const clientMongo = await clientPromise
    const db = clientMongo.db("atms")

    const colGet = db.collection("driver_cost_ticket")
    const colPost = db.collection("drivers_risk")

    for (const item of driver) {
      console.log("driver:", item)

      const existing = await colGet
        .find({
          พจส1: item,
          mmyy: `${month}/${year}`,
        })
        .toArray()

      const uniquePlates = new Set()
      const filteredExisting = existing.filter((doc) => {
        const plate = doc["หัว"] ?? null
        if (uniquePlates.has(plate)) {
          return false
        } else {
          uniquePlates.add(plate)
          return true
        }
      })

      console.log("filteredExisting:", filteredExisting)

      for (const doc of filteredExisting) {
        await colPost.insertOne({
          driver: item,
          plateh: doc["หัว"] ?? null,
          truckno: doc["เลขรถ"] ?? null,
          month,
          year,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ POST drivers_risk error:", error)
    return NextResponse.json(
      { error: "Failed to create drivers_risk" },
      { status: 500 }
    )
  }
}

/* ============================================================================
   PUT – update a drivers_risk row
   PUT /api/drivers
============================================================================ */
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { _id, driver, plateh, truckno, month, year } = body

    if (!_id) {
      return NextResponse.json(
        { error: "_id is required" },
        { status: 400 }
      )
    }

    const update: any = {
      updated_at: new Date(),
    }

    if (driver !== undefined) update.driver = driver
    if (plateh !== undefined) update.plateh = plateh
    if (truckno !== undefined) update.truckno = truckno
    if (month !== undefined) update.month = Number(month)
    if (year !== undefined) update.year = Number(year)

    const clientMongo = await clientPromise
    const db = clientMongo.db("atms")
    const col = db.collection("drivers_risk")

    const result = await col.updateOne(
      { _id: new ObjectId(_id) },
      { $set: update }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ PUT drivers_risk error:", error)
    return NextResponse.json(
      { error: "Failed to update drivers_risk" },
      { status: 500 }
    )
  }
}

/* ============================================================================
   DELETE – delete a drivers_risk row by id
   DELETE /api/drivers?id=xxxx
============================================================================ */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      )
    }

    const clientMongo = await clientPromise
    const db = clientMongo.db("atms")
    const col = db.collection("drivers_risk")

    const result = await col.deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ DELETE drivers_risk error:", error)
    return NextResponse.json(
      { error: "Failed to delete drivers_risk" },
      { status: 500 }
    )
  }
}
