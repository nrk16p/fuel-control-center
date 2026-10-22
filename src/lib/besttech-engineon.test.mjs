import assert from "node:assert/strict"
import { test } from "node:test"

import {
  besttechPlate, buildEvents, cleanPoints, minuteOf, nearestPlant, parkedEngineOn, parseDetailId,
  retryAfterSeconds, thaiTimeMs, withinBudget,
} from "./besttech-engineon.ts"

const PLANT = { code: "P01", lat: 13.7, lng: 100.7 }
const AWAY = { lat: 13.8, lng: 100.8 }   // ~15 km from the plant
const pt = (time, pos, state = "ON_STOP", extra = {}) =>
  ({ gps_time: `2026-10-21 ${time}`, lat: pos.lat, lng: pos.lng, speed: 0, state, ...extra })

test("parked engine-on follows state, else engine ON and speed 0", () => {
  assert.equal(parkedEngineOn({ state: "ON_STOP" }), true)
  assert.equal(parkedEngineOn({ state: "ON_RUN", engine: "ON", speed: 0 }), false)
  assert.equal(parkedEngineOn({ engine: "ON", speed: 0 }), true)
  assert.equal(parkedEngineOn({ engine: "ON", speed: 12 }), false)
})

test("Thai time keeps its wall clock as UTC (how raw_engineon stores it)", () => {
  assert.equal(new Date(thaiTimeMs("2026-10-21 08:15:30")).toISOString(), "2026-10-21T08:15:30.000Z")
  assert.equal(thaiTimeMs("bad"), null)
})

test("cleanPoints drops other days, missing or 0,0 positions, and sorts", () => {
  const rows = cleanPoints([
    pt("10:00:00", AWAY), { ...pt("09:00:00", AWAY) }, { gps_time: "2026-10-20 23:59:00", lat: 1, lng: 1 },
    { gps_time: "2026-10-21 11:00:00", lat: 0, lng: 0 }, { gps_time: "2026-10-21 12:00:00" },
  ], "2026-10-21")
  assert.deepEqual(rows.map((r) => new Date(r.t).toISOString().slice(11, 16)), ["09:00", "10:00"])
})

test("events: gaps add up, > 5 min gaps skip, a 200 m move splits, plant gets its code", () => {
  const points = [
    pt("08:00:00", PLANT), pt("08:03:00", PLANT), pt("08:06:00", PLANT),   // 6 min at plant
    pt("08:20:00", PLANT),                                                  // 14 min gap: not counted
    pt("08:21:00", PLANT, "ON_RUN"),                                        // moving
    pt("09:00:00", AWAY), pt("09:02:00", AWAY), pt("09:04:30", AWAY),     // 4.5 min away
    pt("09:05:00", AWAY, "OFF"),
  ]
  const ev = buildEvents("70-6291", "2026-10-21", points, [PLANT])
  assert.equal(ev.length, 2)
  const [away, plant] = ev   // latest first, like the Terminus page order
  assert.equal(plant.event_id, 1)
  assert.equal(plant.nearest_plant, "P01")
  assert.equal(plant.total_engine_on_min, 6)
  assert.equal(plant.count_records, 2)
  assert.equal(plant.start_time, "2026-10-21T08:00:00.000Z")
  assert.equal(plant.end_time, "2026-10-21T08:06:00.000Z")
  assert.equal(away.nearest_plant, null)
  assert.equal(away.total_engine_on_min, 4.5)
  assert.equal(away._id, "70-6291_2026-10-21_2")
  assert.equal(away.version_type, "besttech")
})

test("nearestPlant only within 200 m", () => {
  assert.equal(nearestPlant(13.7005, 100.7, [PLANT]), "P01")    // ~55 m
  assert.equal(nearestPlant(13.703, 100.7, [PLANT]), null)      // ~330 m
  assert.equal(nearestPlant(13.7, 100.7, []), null)
})

test("plate and id parsing", () => {
  assert.equal(besttechPlate("ME152 (71-8635 สบ.)"), "71-8635")
  assert.equal(besttechPlate("70-6294 สบ."), "70-6294")
  assert.equal(besttechPlate("ไม่มีทะเบียน"), null)
  assert.deepEqual(parseDetailId("70-6291_2026-10-21"), { plate: "70-6291", day: "2026-10-21" })
  assert.deepEqual(parseDetailId("70-6291_2026-10-21_d1"), { plate: "70-6291", day: "2026-10-21" })
  assert.equal(parseDetailId("70-6291"), null)
})

test("budget: 5 calls per minute, retry after the minute turns", () => {
  assert.equal(withinBudget(5), true)
  assert.equal(withinBudget(6), false)
  assert.equal(minuteOf(120_000), 2)
  assert.equal(retryAfterSeconds(Date.UTC(2026, 9, 21, 8, 0, 45)), 15)
  assert.equal(retryAfterSeconds(Date.UTC(2026, 9, 21, 8, 0, 59, 900)), 1)
})
