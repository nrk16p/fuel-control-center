import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { DEFAULT_SETTINGS, SETTINGS_ID, withDefaults, type SettingsDoc } from "@/lib/fuel-settings"

export async function GET() {
  try {
    if (fixturesOn()) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS, updated_at: null, updated_by: null, fixtures: true })
    }
    const doc = await (await analytics()).collection<SettingsDoc>("fuel_settings").findOne({ _id: SETTINGS_ID })
    return NextResponse.json({ settings: withDefaults(doc), updated_at: doc?.updated_at ?? null, updated_by: doc?.updated_by ?? null })
  } catch (err) {
    console.error("FUEL SETTINGS GET ERROR:", err)
    return NextResponse.json({ error: "โหลดการตั้งค่าไม่สำเร็จ" }, { status: 500 })
  }
}
