import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { SETTINGS_ID, settingsPayload, validateSettings, type SettingsDoc } from "@/lib/fuel-settings"

export async function GET() {
  // อีเมลผู้แก้ล่าสุดให้เห็นเฉพาะคนที่ล็อกอิน (/api เปิดสาธารณะ)
  const signedIn = Boolean((await getServerSession(authOptions))?.user?.email)
  try {
    if (fixturesOn()) return NextResponse.json({ ...settingsPayload(null, signedIn), fixtures: true })
    const doc = await (await analytics()).collection<SettingsDoc>("fuel_settings").findOne({ _id: SETTINGS_ID })
    return NextResponse.json(settingsPayload(doc, signedIn))
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
