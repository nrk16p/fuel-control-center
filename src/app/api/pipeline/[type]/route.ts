import { NextResponse } from "next/server"

/**
 * Proxy to the api-ncac pipeline framework — keeps PIPELINE_API_KEY server-side.
 *
 * POST /api/pipeline/{type}  → POST {NCAC}/pipeline/run/{ncacType}   (trigger, body = params)
 * GET  /api/pipeline/{type}  → GET  {NCAC}/pipeline/status/{ncacType} (status)
 * GET  /api/pipeline/health  → GET  {NCAC}/                            (health)
 */

const NCAC_BASE = process.env.NCAC_API_BASE ?? "https://api-ncac.onrender.com"
const API_KEY = process.env.PIPELINE_API_KEY ?? ""

// UI job type → api-ncac pipeline type
const TYPE_MAP: Record<string, string> = {
  engineon: "engineon",
  drivercost: "drivercost_ticket",
  vehiclemaster: "vehiclemaster",
  "engineon-trip-summary": "engineon_trip_summary",
}

// legacy fields the old api-engineon accepted — never forward these
const STRIP_KEYS = new Set(["phpsessid", "base_url", "index_url", "db_name", "collection_name"])

type Ctx = { params: Promise<{ type: string }> | { type: string } }

export async function POST(req: Request, ctx: Ctx) {
  const { type } = await Promise.resolve(ctx.params)
  const ncacType = TYPE_MAP[type]
  if (!ncacType) {
    return NextResponse.json({ error: `Unknown pipeline type: ${type}` }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }
  const params = Object.fromEntries(
    Object.entries(body ?? {}).filter(([k]) => !STRIP_KEYS.has(k))
  )

  try {
    const res = await fetch(`${NCAC_BASE}/pipeline/run/${ncacType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(params),
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail ?? `Pipeline trigger failed (${res.status})` },
        { status: res.status }
      )
    }
    // job_id encodes the trigger time — status polling matches etl_jobs.created_at against it
    return NextResponse.json({ ...data, job_id: `${type}:${Date.now()}` })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Pipeline trigger failed" }, { status: 502 })
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  const { type } = await Promise.resolve(ctx.params)

  if (type === "health") {
    try {
      const res = await fetch(`${NCAC_BASE}/`, { cache: "no-store" })
      return NextResponse.json({ status: res.ok ? "ok" : "error" })
    } catch {
      return NextResponse.json({ status: "error" })
    }
  }

  const ncacType = TYPE_MAP[type]
  if (!ncacType) {
    return NextResponse.json({ error: `Unknown pipeline type: ${type}` }, { status: 400 })
  }

  try {
    const res = await fetch(`${NCAC_BASE}/pipeline/status/${ncacType}`, { cache: "no-store" })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Status fetch failed" }, { status: 502 })
  }
}
