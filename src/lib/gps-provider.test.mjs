import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildPayload, engineSource, rowProviders, lastSeenBefore, plateKey, providersOn, rangeFor, thaiDate,
} from "./gps-provider.ts"

test("plateKey matches the summary plate to gps.distance_* vehicle_no", () => {
  assert.equal(plateKey("สบ.71-1515"), "71-1515")
  assert.equal(plateKey("71-4447 (แจ้งยกเลิก26.06.2026)"), "71-4447")
  assert.equal(plateKey("3ฒภ5383"), "3ฒภ5383")
  assert.equal(plateKey("สบ.กว4506"), "กว4506")
  assert.equal(plateKey(null), "")
})

const rows = [
  { provider: "terminus", vehicle_no: "สบ.71-1515", date_key: "2026-10-01" },
  { provider: "besttech", vehicle_no: "สบ.71-1515", date_key: "2026-10-01" },
  { provider: "besttech", vehicle_no: "สบ.71-1515", date_key: "2026-10-01" },
  { provider: "cartrack", vehicle_no: "สบ.71-2750", date_key: "2026-09-29" },
  { provider: "cartrack", vehicle_no: "สบ.71-2750", date_key: "2026-09-20" },
  { provider: "hino", vehicle_no: "สบ.72-5712", date_key: "2026-10-03" },
]

test("buildPayload groups providers per plate/day and keeps the latest day before the range", () => {
  const p = buildPayload("2026-10-01", "2026-10-31", rows)
  assert.deepEqual(p.days["71-1515"], { "2026-10-01": "tb" })
  assert.deepEqual(p.prior["71-2750"], ["2026-09-29", "c"])
  assert.equal(p.days["71-2750"], undefined)
})

test("providersOn and lastSeenBefore", () => {
  const p = buildPayload("2026-10-01", "2026-10-31", rows)
  assert.deepEqual(providersOn(p, "71-1515", "2026-10-01").map((x) => x.key), ["terminus", "besttech"])
  assert.deepEqual(providersOn(p, "71-2750", "2026-10-05"), [])
  assert.deepEqual(lastSeenBefore(p, "71-2750", "2026-10-05").day, "2026-09-29")
  assert.equal(lastSeenBefore(p, "72-5712", "2026-10-10").providers[0].key, "hino")
  assert.equal(lastSeenBefore(p, "72-5712", "2026-10-03"), null)
  assert.deepEqual(providersOn(null, "71-1515", "2026-10-01"), [])
})

test("engineSource maps summary version_type to the provider of the minutes", () => {
  assert.equal(engineSource("besttech"), "besttech")
  assert.equal(engineSource("v2"), "terminus")
  assert.equal(engineSource("v1"), "terminus")
  assert.equal(engineSource(undefined), null)
})

test("rangeFor and thaiDate", () => {
  assert.deepEqual(rangeFor(2026, 9), { from: "2026-09-01", to: "2026-09-30" })
  assert.deepEqual(rangeFor(2024, 2), { from: "2024-02-01", to: "2024-02-29" })
  assert.deepEqual(rangeFor(2026, "all"), { from: "2026-01-01", to: "2026-12-31" })
  assert.equal(thaiDate("2026-09-29"), "29/09/2569")
})

test("rowProviders adds the engine-on source when the distance table has no row yet", () => {
  const p = buildPayload("2026-10-01", "2026-10-31", rows)
  assert.deepEqual(rowProviders(p, "70-6292", "2026-10-20", "v1").map((x) => x.key), ["terminus"])
  assert.deepEqual(rowProviders(p, "71-1515", "2026-10-01", "besttech").map((x) => x.key), ["terminus", "besttech"])
  assert.deepEqual(rowProviders(p, "71-2750", "2026-10-05", undefined), [])
  assert.deepEqual(rowProviders(null, "70-6292", "2026-10-20", "v2").map((x) => x.key), ["terminus"])
})
