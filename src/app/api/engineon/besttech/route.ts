import { NextResponse } from "next/server"
import { buildEvents, parseDetailId } from "@/lib/besttech-engineon"
import { BesttechFailure, RATE_LIMIT_PER_MIN, RateLimited, besttechDayPoints, loadPlants } from "@/lib/besttech-live"

// Engine-on events of one Besttech truck/day, computed live from Besttech /history.
// ?id=70-6291_2026-10-21 · nothing is stored · shared limit of RATE_LIMIT_PER_MIN Besttech calls/min.
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(req: Request) {
  const parsed = parseDetailId(new URL(req.url).searchParams.get("id") ?? "")
  if (!parsed) return NextResponse.json({ error: "id must look like 70-6291_2026-10-21" }, { status: 400 })
  const { plate, day } = parsed

  try {
    const [{ points, vehicles }, plants] = await Promise.all([besttechDayPoints(plate, day), loadPlants()])
    const events = buildEvents(plate, day, points, plants)
    return NextResponse.json(
      { plate, day, vehicles, points: points.length, events, limit_per_min: RATE_LIMIT_PER_MIN },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    if (error instanceof RateLimited) {
      return NextResponse.json(
        { error: "rate_limited", reason: error.reason, retry_after_s: error.retryAfterS, limit_per_min: RATE_LIMIT_PER_MIN },
        { status: 429, headers: { "Retry-After": String(error.retryAfterS) } },
      )
    }
    console.error("besttech engine-on detail failed:", error)
    const reason = error instanceof BesttechFailure ? error.code : "network_or_db"
    return NextResponse.json({ error: "besttech_failed", reason }, { status: 502 })
  }
}
