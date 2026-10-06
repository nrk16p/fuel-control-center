import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { DEFAULT_SETTINGS, SETTINGS_ID, validateSettings, withDefaults, type SettingsDoc } from "@/lib/fuel-settings"

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

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนบันทึก" }, { status: 401 })
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const checked = validateSettings(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  try {
    if (fixturesOn()) return NextResponse.json({ ok: true, saved: false, settings: checked.value })
    // $set เฉพาะสามค่านี้ — ค่าอื่นในเอกสารเดียวกันเป็นของ Part 2
    await (await analytics())
      .collection<SettingsDoc>("fuel_settings")
      .updateOne({ _id: SETTINGS_ID }, { $set: { ...checked.value, updated_at: new Date(), updated_by: email } }, { upsert: true })
    return NextResponse.json({ ok: true, saved: true, settings: checked.value })
  } catch (err) {
    console.error("FUEL SETTINGS PUT ERROR:", err)
    return NextResponse.json({ error: "บันทึกการตั้งค่าไม่สำเร็จ" }, { status: 500 })
  }
}
