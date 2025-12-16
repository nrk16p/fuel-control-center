import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"

/* ============================================================================
   GET – list plants (optional filter by client)
   GET /api/plants
   GET /api/plants?client=Acon
============================================================================ */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientName = searchParams.get("client")

    const client = await clientPromise
    const db = client.db("atms")
    const col = db.collection("plants")

    const query: any = {}
    if (clientName) query.client = clientName

    const data = await col.find(query).sort({ plant_code: 1 }).toArray()

    return NextResponse.json(data)
  } catch (error) {
    console.error("❌ GET plants error:", error)
    return NextResponse.json(
      { error: "Failed to fetch plants" },
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
    const { client, plant_code, Latitude, Longitude } = body

    if (!client || !plant_code || Latitude == null || Longitude == null) {
      return NextResponse.json(
        { error: "client, plant_code, Latitude, Longitude are required" },
        { status: 400 }
      )
    }

    const latlng = `${Latitude}, ${Longitude}`

    const clientMongo = await clientPromise
    const db = clientMongo.db("atms")
    const col = db.collection("plants")

    const result = await col.insertOne({
      client,
      plant_code,
      Latitude,
      Longitude,
      latlng,
      created_at: new Date(),
      updated_at: new Date(),
    })

    return NextResponse.json({
      success: true,
      insertedId: result.insertedId,
    })
  } catch (error) {
    console.error("❌ POST plant error:", error)
    return NextResponse.json(
      { error: "Failed to create plant" },
      { status: 500 }
    )
  }
}

/* ============================================================================
   PUT – update plant
   PUT /api/plants
============================================================================ */
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { _id, client, plant_code, Latitude, Longitude } = body

    if (!_id) {
      return NextResponse.json(
        { error: "_id is required" },
        { status: 400 }
      )
    }

    const update: any = {
      updated_at: new Date(),
    }

    if (client !== undefined) update.client = client
    if (plant_code !== undefined) update.plant_code = plant_code
    if (Latitude !== undefined) update.Latitude = Latitude
    if (Longitude !== undefined) update.Longitude = Longitude

    if (Latitude !== undefined && Longitude !== undefined) {
      update.latlng = `${Latitude}, ${Longitude}`
    }

    const clientMongo = await clientPromise
    const db = clientMongo.db("atms")
    const col = db.collection("plants")

    await col.updateOne(
      { _id: new ObjectId(_id) },
      { $set: update }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ PUT plant error:", error)
    return NextResponse.json(
      { error: "Failed to update plant" },
      { status: 500 }
    )
  }
}

/* ============================================================================
   DELETE – delete plant by id
   DELETE /api/plants?id=xxxx
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
    const col = db.collection("plants")

    await col.deleteOne({ _id: new ObjectId(id) })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ DELETE plant error:", error)
    return NextResponse.json(
      { error: "Failed to delete plant" },
      { status: 500 }
    )
  }
}
