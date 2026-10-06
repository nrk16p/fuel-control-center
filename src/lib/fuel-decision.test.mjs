import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { DECISIONS, buildReviewDoc, keyAction, legacyPlate, validateDecision } from "./fuel-decision.ts"

const events = JSON.parse(readFileSync(new URL("./__fixtures__/fuel-events-sample.json", import.meta.url), "utf8"))
const byPlate = (plate) => events.find((e) => e.plate === plate)
const NOW = new Date("2026-10-06T02:00:00.000Z")

test("accepts the four decisions and trims notes", () => {
  assert.deepEqual(validateDecision({ decision: "noise", note: "  ok  " }), { ok: true, value: { decision: "noise", note: "ok" } })
  for (const d of DECISIONS.filter((d) => d !== "real_loss")) assert.equal(validateDecision({ decision: d }).ok, true, d)
})

test("refuses unknown decisions and real_loss without a note", () => {
  assert.equal(validateDecision({ decision: "reviewed_ok" }).ok, false)
  assert.equal(validateDecision(null).ok, false)
  assert.equal(validateDecision({ decision: "real_loss", note: "  ab " }).ok, false)
  assert.equal(validateDecision({ decision: "real_loss", note: "x".repeat(1001) }).ok, false)
  assert.equal(validateDecision({ decision: "real_loss", note: "เทียบใบเติมแล้ว" }).ok, true)
})

test("legacy plate drops the province prefix only for xx-xxxx plates", () => {
  assert.equal(legacyPlate("สบ.71-8623"), "71-8623")
  assert.equal(legacyPlate(" กว4506 "), "กว4506")
})

test("review doc for a loss uses the event's levels", () => {
  const doc = buildReviewDoc({
    event: byPlate("สบ.71-8635"),
    input: { decision: "real_loss", note: "เทียบใบเติมแล้ว" },
    reviewer: "fuel@menatransport.co.th",
    now: NOW,
  })
  assert.deepEqual(doc, {
    plate: "71-8635", plate_norm: "สบ.71-8635", event_id: "สบ.71-8635|2026-10-05T02:10",
    start_ts: Date.UTC(2026, 9, 4, 19, 10), end_ts: Date.UTC(2026, 9, 4, 19, 35),
    fuel_start: 120, fuel_end: 87.6, fuel_diff: 32.4, duration_min: 25,
    decision: "real_loss", note: "เทียบใบเติมแล้ว", reviewer: "fuel@menatransport.co.th",
    suggestion: "real_loss", scorer: "rules-v1", audit: false, revision_of: null, created_at: NOW,
  })
})

test("a second decision becomes a revision and refuels count as negative", () => {
  const doc = buildReviewDoc({
    event: { ...byPlate("สบ.71-7463"), start: new Date("2026-10-05T04:20:00.000Z") },
    input: { decision: "legit", note: "" },
    reviewer: "a@menatransport.co.th",
    now: NOW,
  })
  assert.equal(doc.revision_of, "6701a0000000000000000001")
  assert.equal(doc.fuel_diff, -80)
  assert.equal(doc.fuel_start, null)
  assert.equal(doc.duration_min, 11)
})

test("audit picks are marked on the review, also when re-deciding", () => {
  const input = { decision: "noise", note: "" }
  const pick = byPlate("สบ.72-8334")
  assert.equal(buildReviewDoc({ event: pick, input, reviewer: "a@menatransport.co.th", now: NOW }).audit, true)
  const again = { ...pick, status: "decided", audit: true, review_id: "6701a0000000000000000003" }
  assert.equal(buildReviewDoc({ event: again, input, reviewer: "a@menatransport.co.th", now: NOW }).audit, true)
  assert.equal(buildReviewDoc({ event: byPlate("สบ.71-7463"), input, reviewer: "a@menatransport.co.th", now: NOW }).audit, false)
})

test("keyboard map", () => {
  assert.deepEqual(keyAction("1", false), { type: "decide", decision: "real_loss" })
  assert.deepEqual(keyAction("4", false), { type: "decide", decision: "follow_up" })
  assert.deepEqual(keyAction("J", false), { type: "next" })
  assert.deepEqual(keyAction("k", false), { type: "prev" })
  assert.deepEqual(keyAction("n", false), { type: "note" })
  assert.deepEqual(keyAction("Escape", false), { type: "close" })
  assert.equal(keyAction("1", true), null)
  assert.equal(keyAction("toString", false), null)
  assert.equal(keyAction("x", false), null)
})
