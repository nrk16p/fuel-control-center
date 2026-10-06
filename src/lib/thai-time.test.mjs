import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addDays, dateKeysBetween, dayStartMs, fmtDateKey, fmtThaiDateTime, fmtThaiDay, fmtThaiTime,
  thaiDateKey, thaiHour, thaiMidnight, windowDateKeys, yesterdayKey,
} from "./thai-time.ts"

// UTC wall clock → epoch ms (Thailand is UTC+7)
const at = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi)

test("formats Thai wall time", () => {
  const ts = at(2026, 10, 4, 19, 10) // 02:10 on 5 Oct in Thailand
  assert.equal(fmtThaiTime(ts), "02:10")
  assert.equal(fmtThaiDay(ts), "5 ต.ค.")
  assert.equal(fmtThaiDateTime(ts), "5 ต.ค. 02:10")
  assert.ok(Math.abs(thaiHour(ts) - (2 + 10 / 60)) < 1e-9)
})

test("date keys follow the Thai calendar day", () => {
  assert.equal(thaiDateKey(at(2026, 10, 4, 17, 0)), "2026-10-05")
  assert.equal(thaiDateKey(at(2026, 10, 4, 16, 59)), "2026-10-04")
  assert.equal(dayStartMs("2026-10-05"), at(2026, 10, 4, 17, 0))
  assert.equal(thaiMidnight(at(2026, 10, 4, 19, 10)), at(2026, 10, 4, 17, 0))
  assert.equal(fmtDateKey("2026-10-05"), "5 ต.ค.")
})

test("adds days across month ends and lists ranges", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01")
  assert.equal(addDays("2026-03-01", -1), "2026-02-28")
  assert.deepEqual(dateKeysBetween("2026-09-29", "2026-10-02"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"])
  assert.deepEqual(dateKeysBetween("2026-10-02", "2026-10-01"), [])
})

test("yesterday is computed in Thai time", () => {
  assert.equal(yesterdayKey(at(2026, 10, 5, 18, 0)), "2026-10-05") // 01:00 on 6 Oct in Thailand
  assert.equal(yesterdayKey(at(2026, 10, 5, 16, 0)), "2026-10-04") // 23:00 on 5 Oct in Thailand
})

test("event windows crossing midnight cover both days", () => {
  const start = at(2026, 10, 5, 16, 30) // 23:30 on 5 Oct
  const end = at(2026, 10, 5, 17, 20) // 00:20 on 6 Oct
  assert.deepEqual(windowDateKeys(start, end, 0), ["2026-10-05", "2026-10-06"])
  assert.deepEqual(windowDateKeys(at(2026, 10, 5, 5, 0), at(2026, 10, 5, 6, 0), 3 * 3_600_000), ["2026-10-05"])
})
