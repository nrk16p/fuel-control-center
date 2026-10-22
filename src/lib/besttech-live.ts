// Server-only: live Besttech calls for the engine-on detail page. No GPS data is stored —
// the only write is a one-document call counter that keeps every viewer together under
// RATE_LIMIT_PER_MIN Besttech calls per minute (Vercel instances do not share memory).
import clientPromise from "@/lib/mongodb"
import {
  RATE_LIMIT_PER_MIN, besttechPlate, minuteOf, retryAfterSeconds, withinBudget,
  type BesttechPoint, type Plant,
} from "@/lib/besttech-engineon"

const BASE_URL = "https://besttransportservice.bestgeosystem.com/apiservices"
const TRACK_TTL_MS = 60 * 60 * 1000
const PLANTS_TTL_MS = 6 * 60 * 60 * 1000
const COUNTER = { db: "analytics", collection: "besttech_rate_limit", id: "fcc_engineon_detail" }

export class RateLimited extends Error {
  constructor(public retryAfterS: number, public reason: "ours" | "besttech") {
    super(reason === "ours" ? "rate limit" : "besttech busy")
  }
}

/** A failure whose `code` is safe to show (never the key or the URL). */
export class BesttechFailure extends Error {
  constructor(public code: string) {
    super(code)
  }
}

let trackCache: { at: number; vehicles: string[] } | null = null
let plantsCache: { at: number; plants: Plant[] } | null = null

/** Counts `cost` Besttech calls against this minute's shared budget; throws RateLimited when full. */
async function spend(cost: number): Promise<void> {
  const now = Date.now()
  const minute = minuteOf(now)
  const col = (await clientPromise).db(COUNTER.db).collection<{ _id: string; minute: number; n: number }>(COUNTER.collection)
  const doc = await col.findOneAndUpdate(
    { _id: COUNTER.id },
    [{ $set: { n: { $cond: [{ $eq: ["$minute", minute] }, { $add: ["$n", cost] }, cost] }, minute } }],
    { upsert: true, returnDocument: "after" },
  )
  if (!withinBudget(doc?.n ?? cost)) throw new RateLimited(retryAfterSeconds(now), "ours")
}

async function post(path: string, body: object): Promise<Record<string, unknown>> {
  const key = (process.env.BESTTECH_API ?? "").trim().replace(/^["']|["']$/g, "")   // pasted values often carry a newline or quotes
  if (!key) throw new BesttechFailure("missing_key")
  // Content-Type must be exactly application/json (a charset suffix gets HTTP 415)
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) throw new BesttechFailure(`${path}_http_${res.status}`)
  const payload = (await res.json()) as Record<string, unknown>
  if (payload.what === "error") {
    if (payload.error_code === "error.TooManyRequests") throw new RateLimited(45, "besttech")
    throw new BesttechFailure(`${path}_${String(payload.error_code ?? "error")}`)
  }
  return payload
}

/** Besttech vehicle codes ("ME152 (71-8635 สบ.)") for a plate — /track, cached for an hour. */
async function vehicleCodes(plate: string): Promise<string[]> {
  if (!trackCache || Date.now() - trackCache.at > TRACK_TTL_MS) {
    await spend(1)
    const payload = await post("track", { last_gps_time: "" })
    const vehicles = ((payload.info as { vehicles?: { vehicle_no?: string }[] } | undefined)?.vehicles ?? [])
      .map((v) => v.vehicle_no)
      .filter((v): v is string => Boolean(v))
    trackCache = { at: Date.now(), vehicles }
  }
  return trackCache.vehicles.filter((v) => besttechPlate(v) === plate)
}

/** All Besttech points of `plate` on `day` (00:00–23:59:59 Thai time). Empty when Besttech has no such truck. */
export async function besttechDayPoints(plate: string, day: string): Promise<{ points: BesttechPoint[]; vehicles: string[] }> {
  const vehicles = await vehicleCodes(plate)
  if (!vehicles.length) return { points: [], vehicles }
  await spend(vehicles.length)
  const points: BesttechPoint[] = []
  for (const vehicle_no of vehicles) {   // a box swap leaves two codes on one plate
    const payload = await post("history", {
      vehicle_no, start_time: `${day} 00:00:00`, end_time: `${day} 23:59:59`,
    })
    points.push(...(((payload.info as { points?: BesttechPoint[] } | undefined)?.points) ?? []))
  }
  return { points, vehicles }
}

export async function loadPlants(): Promise<Plant[]> {
  if (plantsCache && Date.now() - plantsCache.at < PLANTS_TTL_MS) return plantsCache.plants
  const docs = await (await clientPromise).db("atms").collection("plants")
    .find({}, { projection: { _id: 0, plant_code: 1, Latitude: 1, Longitude: 1 } }).toArray()
  const plants = docs
    .map((d) => ({ code: String(d.plant_code ?? ""), lat: Number(d.Latitude), lng: Number(d.Longitude) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  plantsCache = { at: Date.now(), plants }
  return plants
}

export { RATE_LIMIT_PER_MIN }
