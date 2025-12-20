import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

// ฟังก์ชันสำหรับ sampling ข้อมูลทุก 5 นาที
function sampleDataEvery5Minutes(data: any[]) {
  if (data.length === 0) return data;

  // แปลงเวลาจาก string "HH:MM:SS" เป็น minutes
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return hours * 60 + minutes + Math.round(seconds / 60);
  };

  // จัดกลุ่มข้อมูลตามวันที่
  const groupedByDate: { [date: string]: any[] } = {};
  data.forEach(item => {
    const date = item["วันที่"];
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(item);
  });

  const sampledData: any[] = [];

  // sample ข้อมูลแต่ละวัน
  Object.keys(groupedByDate).forEach(date => {
    const dayData = groupedByDate[date];
    
    // เรียงลำดับตามเวลา
    dayData.sort((a, b) => {
      const timeA = timeToMinutes(a["เวลา"]);
      const timeB = timeToMinutes(b["เวลา"]);
      return timeA - timeB;
    });

    // sample ทุก 5 นาที
    let lastSampledMinute = -1;
    
    dayData.forEach(item => {
      const currentMinute = timeToMinutes(item["เวลา"]);
      const currentMinuteRounded = Math.floor(currentMinute / 5) * 5; // round ลงเป็น 5 นาที

      if (currentMinuteRounded !== lastSampledMinute) {
        sampledData.push(item);
        lastSampledMinute = currentMinuteRounded;
      }
    });
  });

  return sampledData;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const search_plate = params.get("plateDriver") || "";
    const search_startDate = params.get("startDate") || "";
    const search_endDate = params.get("endDate") || "";
    
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

    let jobs = await db
      .collection("driving_log")
      .find(query)
      .sort({ "วันที่": 1, "เวลา": 1 })
      .toArray()

    if (jobs.length > 0) {
      jobs = sampleDataEvery5Minutes(jobs);
      console.log("Data sampled every 5 minutes. Original:", jobs.length, "Sampled:", jobs.length);
    }

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
