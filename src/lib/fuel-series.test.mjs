import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  buildSeries, coverageRows, coverageVerdict, lastSeenOf, levelAt, plateCandidates, pointNear, resolvePlate, sliceWindow, statusOf,
} from "./fuel-series.ts"
import { decodeColumns, fuelToLitres, toDegrees } from "./series-codec.ts"

const docs = JSON.parse(readFileSync(new URL("./__fixtures__/gps-series-sample.json", import.meta.url), "utf8"))
const codec = { decodeColumns, fuelToLitres, toDegrees }
const utc = (d, h, mi) => Date.UTC(2026, 9, d, h, mi)
const r2 = (values) => values.map((v) => (v == null ? null : Math.round(v * 100) / 100))

test("status follows engine and speed", () => {
  assert.equal(statusOf(0, 0), "ดับเครื่อง")
  assert.equal(statusOf(3, 1), "จอดรถ")
  assert.equal(statusOf(40, 1), "รถวิ่ง")
})

test("builds one ordered series per source in litres", () => {
  const out = buildSeries([docs[2], docs[0], docs[3], docs[1]], codec)
  assert.equal(out.length, 2)
  const bt = out.find((s) => s.source === "besttech")
  const te = out.find((s) => s.source === "terminus")
  assert.deepEqual(bt.ts, [utc(4, 19, 0), utc(4, 19, 1), utc(4, 19, 30), utc(4, 19, 31), utc(4, 20, 0), utc(4, 20, 1), utc(5, 17, 0), utc(5, 17, 1)])
  assert.deepEqual(r2(bt.fuel), [120, 119.8, 88, 87.6, 87.6, null, 87.4, 87.3])
  assert.deepEqual(r2(bt.hi).slice(0, 2), [120.2, 120])
  assert.deepEqual([bt.status[0], bt.status[6], bt.status[7]], ["ดับเครื่อง", "รถวิ่ง", "รถวิ่ง"])
  assert.deepEqual(bt.lat.slice(4, 6), [13.79576, null])
  assert.deepEqual(r2(te.fuel), [118, 88])
  assert.deepEqual(te.status, ["จอดรถ", "ดับเครื่อง"])
})

test("slices a time window", () => {
  const [bt] = buildSeries([docs[0]], codec)
  const cut = sliceWindow(bt, utc(4, 19, 0), utc(4, 19, 31))
  assert.equal(cut.ts.length, 4)
  assert.deepEqual(r2(cut.fuel), [120, 119.8, 88, 87.6])
  assert.equal(cut.status.length, 4)
})

test("finds the nearest level and position", () => {
  const [bt, te] = buildSeries([docs[0], docs[1]], codec)
  assert.equal(Math.round(levelAt(bt, utc(4, 19, 10)) * 100) / 100, 119.8)
  assert.deepEqual(pointNear([bt, te], utc(4, 19, 12)), { lat: 13.7958, lng: 100.5572 })
  assert.equal(pointNear([], utc(4, 19, 12)), null)
})

test("coverage verdict prefers usable data and otherwise names the cause", () => {
  assert.deepEqual(coverageVerdict([]), { kind: "no_data", sources: [] })
  assert.deepEqual(coverageVerdict([{ source: "besttech", status: "offline" }]), { kind: "offline", sources: ["besttech"] })
  assert.deepEqual(
    coverageVerdict([{ source: "terminus", status: "no_sensor" }, { source: "besttech", status: "offline" }]),
    { kind: "no_sensor", sources: ["terminus"] },
  )
  assert.deepEqual(
    coverageVerdict([{ source: "terminus", status: "stuck" }, { source: "besttech", status: "ok" }]),
    { kind: "ok", sources: ["besttech"] },
  )
})

test("last seen is the newest minute with a position", () => {
  assert.deepEqual(lastSeenOf(docs[0], codec), { date_key: "2026-10-05", source: "besttech", time: "03:01", lat: 13.79576, lng: 100.55717 })
  assert.deepEqual(lastSeenOf(docs[3], codec), { date_key: "2026-10-05", source: "besttech", time: null, lat: null, lng: null })
})

test("coverage rows put problems first and fill missing fields", () => {
  const rows = coverageRows(docs.filter((d) => d.date_key === "2026-10-05"))
  assert.deepEqual(rows.map((r) => [r.plate, r.source, r.status]), [
    ["สบ.71-8623", "besttech", "offline"],
    ["สบ.71-8635", "besttech", "ok"],
    ["สบ.71-8635", "terminus", "ok"],
  ])
  assert.deepEqual(rows[0], {
    plate: "สบ.71-8623", source: "besttech", truck_code: null, status: "offline", minutes: 0,
    fuel_valid_share: 0, last: null, moved_km: 0, tank_l: 200, tank_from: "default",
  })
})

test("legacy xx-xxxx plates (home search) also find the province form gps_series uses", () => {
  assert.deepEqual(plateCandidates("71-8623"), ["71-8623", "สบ.71-8623"])
  assert.deepEqual(plateCandidates(" สบ.71-8623 "), ["สบ.71-8623"])
  assert.deepEqual(plateCandidates("3ฒภ5383"), ["3ฒภ5383"])
  assert.equal(resolvePlate("71-8623", [undefined, null, "สบ.71-8623"]), "สบ.71-8623")
  assert.equal(resolvePlate(" 71-8623 ", []), "71-8623")
  const legacy = plateCandidates("71-8623")
  assert.ok(docs.some((d) => legacy.includes(d.plate)), "the fixture truck is found from the legacy form")
})
