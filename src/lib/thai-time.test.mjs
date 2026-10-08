import assert from "node:assert/strict"
import { test } from "node:test"

import {
  MAX_DATE_KEYS, addDays, dateKeysBetween, dayStartMs, daySpan, fmtDateKey, fmtThaiDateTime, fmtThaiDay, fmtThaiTime,
  isDateKey, thaiDateKey, thaiHour, thaiMidnight, windowDateKeys, yesterdayKey,
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

test("only real calendar days are date keys", () => {
  for (const key of ["2026-10-05", "2024-02-29", "2026-12-31"]) assert.equal(isDateKey(key), true, key)
  for (const key of ["9999-99-99", "2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "0099-01-01", "2026-1-05", "2026-10-05x", ""]) {
    assert.equal(isDateKey(key), false, key)
  }
})

test("day spans are computed, not counted", () => {
  assert.equal(daySpan("2026-10-05", "2026-10-05"), 1)
  assert.equal(daySpan("2026-09-28", "2026-10-05"), 8)
  assert.equal(daySpan("2025-12-30", "2026-01-02"), 4)
  assert.ok(daySpan("2026-10-05", "2026-10-04") <= 0)
  const t0 = performance.now()
  assert.equal(daySpan("2026-01-01", "9999-12-31"), 2_912_443)
  assert.ok(performance.now() - t0 < 50)
})

test("date key ranges refuse impossible keys and huge spans before looping", () => {
  const t0 = performance.now()
  assert.throws(() => dateKeysBetween("2026-01-01", "9999-99-99"), RangeError)
  assert.throws(() => dateKeysBetween("2026-02-30", "2026-03-02"), RangeError)
  assert.throws(() => dateKeysBetween("2026-01-01", "9999-12-31"), RangeError)
  assert.ok(performance.now() - t0 < 50)
  assert.equal(dateKeysBetween("2026-01-01", addDays("2026-01-01", MAX_DATE_KEYS - 1)).length, MAX_DATE_KEYS)
  assert.deepEqual(dateKeysBetween("2026-10-05", "2026-10-04"), [])
})
