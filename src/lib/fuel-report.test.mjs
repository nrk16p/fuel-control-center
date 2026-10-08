import assert from "node:assert/strict"
import { test } from "node:test"

import { buildReport, confirmedRows, weekStart } from "./fuel-report.ts"

const sample = [
  { plate: "สบ.71-8622", driver: "คนขับ B", plant: "บางนา", date_key: "2026-10-04", litres: 41, decision: "real_loss", suggestion: "real_loss", audit: false },
  { plate: "สบ.71-8635", driver: null, plant: null, date_key: "2026-10-05", litres: 32.4, decision: "real_loss", suggestion: "real_loss", audit: false },
  { plate: "สบ.71-8622", driver: "คนขับ B", plant: "บางนา", date_key: "2026-10-12", litres: 10, decision: "real_loss", suggestion: "noise", audit: true },
  { plate: "สบ.72-8334", driver: null, plant: null, date_key: "2026-10-05", litres: 9.5, decision: "noise", suggestion: "noise", audit: true },
  { plate: "สบ.71-7463", driver: null, plant: null, date_key: "2026-10-05", litres: 80, decision: "legit", suggestion: "legit", audit: false },
  { plate: "สบ.70-6303", driver: null, plant: null, date_key: "2026-10-05", litres: 18, decision: "follow_up", suggestion: "real_loss", audit: false },
  { plate: "สบ.72-9520", driver: null, plant: null, date_key: "2026-10-05", litres: 6, decision: null, suggestion: "noise", audit: false },
]

test("totals confirmed losses and prices them", () => {
  const r = buildReport(sample, 30)
  assert.deepEqual(r.confirmed, { events: 3, litres: 83.4, baht: 2502 })
  assert.deepEqual(r.byTruck, [
    { key: "สบ.71-8622", events: 2, litres: 51, baht: 1530 },
    { key: "สบ.71-8635", events: 1, litres: 32.4, baht: 972 },
  ])
  assert.deepEqual(r.byDriver.map((x) => x.key), ["คนขับ B", "ไม่ทราบคนขับ"])
  assert.deepEqual(r.byPlant.map((x) => x.key), ["บางนา", "ไม่ระบุแพลนท์"])
  const unpriced = buildReport(sample, null)
  assert.deepEqual(unpriced.confirmed, { events: 3, litres: 83.4, baht: null })
  assert.equal(unpriced.byTruck[0].baht, null)
})

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-10-04"), "2026-09-28")
  assert.equal(weekStart("2026-10-05"), "2026-10-05")
  assert.deepEqual(buildReport(sample, 30).byWeek, [
    { week: "2026-09-28", events: 1, litres: 41 },
    { week: "2026-10-05", events: 1, litres: 32.4 },
    { week: "2026-10-12", events: 1, litres: 10 },
  ])
})

test("acceptance ignores follow-ups and undecided events", () => {
  assert.deepEqual(buildReport(sample, 30).acceptance, { decided: 5, agreed: 4, rate: 0.8 })
  assert.deepEqual(buildReport([], 30).acceptance, { decided: 0, agreed: 0, rate: null })
})

test("audit results count decided spot-checks", () => {
  assert.deepEqual(buildReport(sample, 30).audit, { checked: 2, realLoss: 1, noise: 1, legit: 0, followUp: 0 })
})

test("excel rows list each confirmed loss", () => {
  assert.deepEqual(confirmedRows(sample, 30).map((r) => [r["วันที่"], r["ทะเบียน"], r["ลิตร"], r["บาท"]]), [
    ["2026-10-04", "สบ.71-8622", 41, 1230],
    ["2026-10-05", "สบ.71-8635", 32.4, 972],
    ["2026-10-12", "สบ.71-8622", 10, 300],
  ])
  assert.equal(confirmedRows(sample, null)[0]["บาท"], null)
})
