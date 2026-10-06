import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_SERIES } from "@/lib/fuel-fixtures"
import { coverageRows, type SeriesDoc } from "@/lib/fuel-series"
import { isDateKey, yesterdayKey } from "@/lib/thai-time"


export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || yesterdayKey(Date.now())
  if (!isDateKey(date)) return NextResponse.json({ error: "date ต้องเป็น YYYY-MM-DD" }, { status: 400 })
  try {
    const docs: SeriesDoc[] = fixturesOn()
      ? FIXTURE_SERIES.filter((d) => d.date_key === date)
      : await (await analytics())
          .collection<SeriesDoc>("gps_series")
          .find({ date_key: date }, { projection: { cols: 0 } })
          .toArray()
    const rows = coverageRows(docs)
    const counts: Record<string, number> = {}
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1
    return NextResponse.json({ date, rows, counts })
  } catch (err) {
    console.error("FUEL COVERAGE ERROR:", err)
    return NextResponse.json({ error: "โหลดสถานะข้อมูลไม่สำเร็จ" }, { status: 500 })
  }
}
