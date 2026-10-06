import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { buildReviewDoc, validateDecision } from "@/lib/fuel-decision"
import { FIXTURE_EVENTS } from "@/lib/fuel-fixtures"
import type { FuelEventDoc } from "@/lib/fuel-types"

type Ctx = { params: Promise<{ id: string }> }

// งานกลางคืนรันซ้ำอาจแทนที่เหตุการณ์ที่ยังไม่ตัดสินด้วย _id ใหม่ (Part 2) — ให้ผู้ใช้โหลดรายการใหม่
const GONE = "ไม่พบเหตุการณ์นี้ (อาจถูกคำนวณใหม่) — โหลดรายการใหม่"

export async function POST(request: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions)
  const reviewer = session?.user?.email
  if (!reviewer) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนบันทึก" }, { status: 401 })

  const { id } = await ctx.params
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const checked = validateDecision(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  try {
    if (fixturesOn()) {
      const event = FIXTURE_EVENTS.find((e) => e._id === id)
      if (!event) return NextResponse.json({ error: GONE }, { status: 404 })
      const review = buildReviewDoc({ event, input: checked.value, reviewer, now: new Date() })
      return NextResponse.json({ ok: true, saved: false, review })
    }
    const db = await analytics()
    const events = db.collection<FuelEventDoc>("fuel_events")
    const reviews = db.collection("fuel_drop_reviews")
    const event = await events.findOne({ _id: id })
    if (!event) return NextResponse.json({ error: GONE }, { status: 404 })
    const now = new Date()
    const review = buildReviewDoc({ event, input: checked.value, reviewer, now })
    const { insertedId } = await reviews.insertOne(review)
    const { matchedCount } = await events.updateOne(
      { _id: id },
      {
        $set: {
          status: "decided",
          decision: checked.value.decision,
          review_id: insertedId,
          updated_at: now,
          ...(review.audit ? { audit: true } : {}),
        },
      },
    )
    if (!matchedCount) {
      // เหตุการณ์ถูกแทนที่ระหว่างนั้น — ไม่เก็บรีวิวที่ไม่มีเหตุการณ์
      await reviews.deleteOne({ _id: insertedId })
      return NextResponse.json({ error: GONE }, { status: 404 })
    }
    return NextResponse.json({ ok: true, saved: true, review_id: insertedId })
  } catch (err) {
    console.error("FUEL DECISION ERROR:", err)
    return NextResponse.json({ error: "บันทึกการตัดสินไม่สำเร็จ" }, { status: 500 })
  }
}
