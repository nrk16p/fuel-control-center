import assert from "node:assert/strict"
import { test } from "node:test"

import { DEFAULT_SETTINGS, settingsPayload, validateSettings, withDefaults } from "./fuel-settings.ts"

test("defaults fill missing fields and ignore Part 2's own fields", () => {
  assert.deepEqual(withDefaults(null), { auto_close_conf: 0.95, audit_rate: 0.05, price_per_litre: null })
  assert.deepEqual(withDefaults({ audit_rate: 0.1, min_drop_l: 8, price_per_litre: "x" }), { ...DEFAULT_SETTINGS, audit_rate: 0.1 })
  assert.equal(withDefaults({ price_per_litre: 31.5 }).price_per_litre, 31.5)
})

test("validates ranges, accepts numeric strings and an empty price", () => {
  assert.deepEqual(validateSettings({ auto_close_conf: 0.97, audit_rate: "0.1", price_per_litre: 31.5 }), {
    ok: true,
    value: { auto_close_conf: 0.97, audit_rate: 0.1, price_per_litre: 31.5 },
  })
  assert.deepEqual(validateSettings({ auto_close_conf: "0.95", audit_rate: 0, price_per_litre: "" }), {
    ok: true,
    value: { auto_close_conf: 0.95, audit_rate: 0, price_per_litre: null },
  })
  for (const bad of [
    { auto_close_conf: 0.5, audit_rate: 0.05, price_per_litre: 30 },
    { auto_close_conf: 0.95, audit_rate: 0.9, price_per_litre: 30 },
    { auto_close_conf: 0.95, audit_rate: 0.05, price_per_litre: 0 },
    { auto_close_conf: 0.95, price_per_litre: 30 },
    null,
  ]) {
    assert.equal(validateSettings(bad).ok, false, JSON.stringify(bad))
  }
})

test("who changed the settings is shown only to signed-in users (the GET route is public)", () => {
  const doc = { _id: "default", auto_close_conf: 0.9, updated_at: new Date("2026-10-06T01:00:00Z"), updated_by: "a@menatransport.co.th" }
  const anonymous = settingsPayload(doc, false)
  assert.equal("updated_by" in anonymous, false)
  assert.deepEqual(anonymous.settings, withDefaults(doc))
  assert.equal(anonymous.updated_at, doc.updated_at)
  assert.equal(settingsPayload(doc, true).updated_by, "a@menatransport.co.th")
  assert.deepEqual(settingsPayload(null, true), { settings: DEFAULT_SETTINGS, updated_at: null, updated_by: null })
  assert.deepEqual(settingsPayload(null, false), { settings: DEFAULT_SETTINGS, updated_at: null })
})
