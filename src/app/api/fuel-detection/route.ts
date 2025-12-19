import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const search_plate = params.get("plateDriver") || "";
    const search_startDate = params.get("startDate") || "";
    const search_endDate = params.get("endDate") || "";
    console.log("Search Param:", search_plate, search_startDate, search_endDate);
    const client = await clientPromise
    const db = client.db("terminus")
    const query: any = {}

    if (search_startDate && search_endDate) {
      query["วันที่"] = {
        $gte: search_startDate,
        $lte: search_endDate
      };
    } else if (search_startDate) {
      query["วันที่"] = { $gte: search_startDate };
    } else if (search_endDate) {
      query["วันที่"] = { $lte: search_endDate };
    }

    if (search_plate) {
      query["ทะเบียนพาหนะ"] = search_plate;
    }

    console.log("MongoDB Query:", query);

    const jobs = await db
      .collection("driving_log")
      .find(query)
      .sort({ "วันที่": 1 })
      .toArray()

    console.log("Fetched Jobs:", jobs.length);

    return NextResponse.json(jobs)
  } catch (err) {
    console.error("ETL JOBS FETCH ERROR:", err)
    return NextResponse.json(
      { error: "Failed to fetch ETL jobs" },
      { status: 500 }
    )
  }
}
