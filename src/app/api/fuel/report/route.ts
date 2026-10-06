import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS } from "@/lib/fuel-fixtures"
import { buildReport, confirmedRows, type ReportEvent } from "@/lib/fuel-report"
import { DEFAULT_SETTINGS, SETTINGS_ID, withDefaults, type SettingsDoc } from "@/lib/fuel-settings"
import type { FuelEventDoc } from "@/lib/fuel-types"
import { addDays, daySpan, isDateKey, yesterdayKey } from "@/lib/thai-time"

const MAX_DAYS = 366

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const to = params.get("to") || yesterdayKey(Date.now())
  const from = params.get("from") || addDays(to, -29)
  if (!isDateKey(from) || !isDateKey(to) || to < from) {
    return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 })
  }
  if (daySpan(from, to) > MAX_DAYS) {
    return NextResponse.json({ error: `เลือกได้ไม่เกิน ${MAX_DAYS} วัน` }, { status: 400 })
  }
  try {
    let events: ReportEvent[]
    let settings = DEFAULT_SETTINGS
    if (fixturesOn()) {
      events = FIXTURE_EVENTS.filter((e) => e.date_key >= from && e.date_key <= to && e.decision != null)
    } else {
      const db = await analytics()
      const decided = await db
        .collection<FuelEventDoc>("fuel_events")
        .find(
          { date_key: { $gte: from, $lte: to }, decision: { $ne: null } },
          { projection: { plate: 1, driver: 1, plant: 1, date_key: 1, litres: 1, decision: 1, suggestion: 1, audit: 1 } },
        )
        .toArray()
      // ตรวจสุ่มดูจากรีวิวด้วย: งานกลางคืนรันซ้ำแล้ว ReplaceOne ทั้งเอกสาร ฟิลด์ audit บน event จึงหายได้
      const audited = new Set<unknown>(
        await db.collection("fuel_drop_reviews").distinct("event_id", { audit: true, event_id: { $in: decided.map((e) => e._id) } }),
      )
      events = decided.map((e) => ({ ...e, audit: e.audit === true || audited.has(e._id) }))
      settings = withDefaults(await db.collection<SettingsDoc>("fuel_settings").findOne({ _id: SETTINGS_ID }))
    }
    return NextResponse.json({
      from,
      to,
      settings,
      report: buildReport(events, settings.price_per_litre),
      rows: confirmedRows(events, settings.price_per_litre),
    })
  } catch (err) {
    console.error("FUEL REPORT ERROR:", err)
    return NextResponse.json({ error: "โหลดรายงานไม่สำเร็จ" }, { status: 500 })
  }
}
