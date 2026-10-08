import assert from "node:assert/strict"
import { test } from "node:test"

import {
  JOBS, TYPE_MAP, allowedParams, buildRun, etlJobsQuery, formatDuration, initialForm, monthsBetween, pickAllowed, yesterdayBkk,
} from "./pipeline-jobs.ts"

const job = (type) => JOBS.find((j) => j.type === type)
const run = (type, form, now = new Date("2026-10-06T05:00:00Z")) =>
  buildRun(job(type), { ...initialForm(job(type)), ...form }, now)

test("overspeed builds dd/mm/yyyy dates, numbers and a clean plate list", () => {
  const plan = run("overspeed", { start_date: "2026-09-28", end_date: "2026-10-02", plates: " 71-8623 , ,72-5504 " })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.payload, {
    start_date: "28/09/2026", end_date: "02/10/2026", plates: "71-8623,72-5504",
    min_duration_min: 2, min_records: 5, gap_minutes: 2,
  })
  assert.deepEqual(plan.followUps, [])
})

test("no dates means the pipeline's own default (yesterday)", () => {
  const plan = run("overspeed", {})
  assert.equal(plan.ok, true)
  assert.equal("start_date" in plan.payload, false)
})

test("date ranges are checked per job", () => {
  assert.match(run("overspeed", { start_date: "2026-09-01", end_date: "2026-09-08" }).errors[0], /ไม่เกิน 7 วัน/)
  assert.match(run("overspeed", { start_date: "2026-09-05", end_date: "2026-09-01" }).errors[0], /ไม่ก่อนวันเริ่ม/)
  assert.match(run("overspeed", { start_date: "2026-09-05" }).errors[0], /ทั้งวันเริ่มและวันสิ้นสุด/)
  assert.match(run("fuel-series-besttech", { start_date: "2026-09-01", end_date: "2026-09-04" }).errors[0], /ไม่เกิน 3 วัน/)
})

test("numbers must be positive integers", () => {
  assert.match(run("overspeed", { min_records: "0" }).errors[0], /จำนวนเต็มบวก/)
  assert.match(run("overspeed", { gap_minutes: "1.5" }).errors[0], /จำนวนเต็มบวก/)
})

test("rmc: one day, or a range of at most 14 days, or nothing (catch-up)", () => {
  assert.deepEqual(run("rmc-compensation", { date: "2026-10-05", dry_run: true }).payload, { date: "2026-10-05", dry_run: "1" })
  assert.deepEqual(run("rmc-compensation", {}).payload, {})
  assert.match(run("rmc-compensation", { date: "2026-10-05", start: "2026-10-01" }).errors[0], /อย่างใดอย่างหนึ่ง/)
  assert.match(run("rmc-compensation", { start: "2026-10-01" }).errors[0], /ทั้งวันเริ่มและวันสิ้นสุด/)
  assert.match(run("rmc-compensation", { date: "5/10/2026" }).errors[0], /ไม่ถูกต้อง/)
  assert.match(run("rmc-compensation", { start: "2026-09-01", end: "2026-09-15" }).errors[0], /ไม่เกิน 14 วัน/)
  assert.deepEqual(run("rmc-compensation", { start: "2026-07-29", end: "2026-08-11" }).payload,
    { start: "2026-07-29", end: "2026-08-11" })
})

test("engine-on v2 queues a trip-summary rebuild for every month touched", () => {
  const plan = run("engineon", { start_date: "2026-09-29", end_date: "2026-10-02", engine_logic: "v2" })
  assert.equal(plan.payload.engine_logic, "v2")
  assert.deepEqual(plan.followUps.map((f) => f.payload), [{ year: 2026, month: 9 }, { year: 2026, month: 10 }])
  assert.deepEqual(run("engineon", { rebuild_summary: false }).followUps, [])
  assert.deepEqual(run("engineon", {}).followUps.map((f) => f.payload), [{ year: 2026, month: 10 }])
  assert.match(run("engineon", { engine_logic: "v9" }).errors[0], /ตัวเลือก/)
})

test("fuel jobs: force flag and calibration window", () => {
  assert.equal(run("fuel-series-besttech", { force: true }).payload.force, "1")
  assert.deepEqual(run("fuel-tanks", { calib_from: "2026-06-01", calib_to: "2026-07-31" }).payload,
    { calib_from: "2026-06-01", calib_to: "2026-07-31" })
  assert.deepEqual(run("fuel-nightly", {}).payload, {})
})

test("proxy allow-list keeps known keys only (old ETL buttons included)", () => {
  // every forwarded key becomes an env var of the api-ncac script — nothing else may get through
  const body = { start_date: "a", phpsessid: "x", engine_logic: "v2", save_raw: true,
    mongodb_uri: "mongodb://elsewhere", engineon_raw_collection: "raw_engineon_x", path: "/tmp" }
  assert.deepEqual(pickAllowed("engineon", body), { start_date: "a", engine_logic: "v2", save_raw: true })
  assert.deepEqual(pickAllowed("overspeed", { overspeed_collection: "overspeed_x", plates: "71-8623" }), { plates: "71-8623" })
  assert.deepEqual(pickAllowed("vehiclemaster", { anything: 1 }), {})
  assert.deepEqual(pickAllowed("rmc-compensation", { date: "2026-10-05", dry_run: "", start: null }), { date: "2026-10-05" })
  assert.ok(allowedParams("overspeed").includes("plates"))
})

test("every job type maps to an api-ncac pipeline", () => {
  for (const j of JOBS) assert.equal(TYPE_MAP[j.type], j.ncacType)
  assert.equal(TYPE_MAP.drivercost, "drivercost_ticket")
  assert.equal(TYPE_MAP["engineon-trip-summary"], "engineon_trip_summary")
})

test("date helpers", () => {
  assert.equal(yesterdayBkk(new Date("2026-10-05T18:30:00Z")), "2026-10-05") // 01:30 BKK on 6 Oct
  assert.deepEqual(monthsBetween("2026-12-30", "2027-01-02"), [{ year: 2026, month: 12 }, { year: 2027, month: 1 }])
})

test("etl_jobs filters: job_type and a bounded limit", () => {
  assert.deepEqual(etlJobsQuery(new URLSearchParams("job_type=overspeed&limit=5")), { filter: { job_type: "overspeed" }, limit: 5 })
  assert.deepEqual(etlJobsQuery(new URLSearchParams("")), { filter: {}, limit: 50 })
  assert.equal(etlJobsQuery(new URLSearchParams("limit=999")).limit, 200)
  assert.equal(etlJobsQuery(new URLSearchParams("limit=abc")).limit, 50)
  assert.equal(etlJobsQuery(new URLSearchParams("limit=0")).limit, 50)
})

test("durations for the last-runs table", () => {
  assert.equal(formatDuration(45), "45 วิ")
  assert.equal(formatDuration(720), "12 นาที")
  assert.equal(formatDuration(5400), "1.5 ชม.")
  assert.equal(formatDuration(null), "-")
})
