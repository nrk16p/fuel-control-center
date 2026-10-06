import assert from "node:assert/strict"
import { test } from "node:test"

import { CLASS_LABEL, CLASS_TONE, classLabel, classTone, eventTone } from "./fuel-classes.ts"
import { EVENT_CLASSES } from "./fuel-events.ts"

test("every class has a Thai label and a tone, place drops included", () => {
  assert.ok(EVENT_CLASSES.includes("place_drop"))
  for (const c of EVENT_CLASSES) {
    assert.ok(CLASS_LABEL[c], c)
    assert.ok(["clay", "butter", "muted", "forest"].includes(CLASS_TONE[c]), c)
  }
  assert.equal(classLabel("place_drop"), "ลดที่แพลนท์/จุดจอด")
  assert.equal(classTone("place_drop"), "butter")
})

test("unknown classes fall back instead of crashing", () => {
  assert.equal(classLabel("tank_swap"), "ประเภทอื่น (tank_swap)")
  assert.equal(classLabel("toString"), "ประเภทอื่น (toString)")
  assert.equal(classLabel(undefined), "ไม่ระบุประเภท")
  assert.equal(classTone("tank_swap"), "muted")
  assert.equal(classTone(null), "muted")
})

test("chart tone: a confirmed loss is red whatever its class; place drops and unknown classes stay muted", () => {
  assert.equal(eventTone({ class: "place_drop", decision: null }), "muted")
  assert.equal(eventTone({ class: "place_drop", decision: "real_loss" }), "clay")
  assert.equal(eventTone({ class: "suspected_loss", decision: null }), "clay")
  assert.equal(eventTone({ class: "suspected_loss", decision: "follow_up" }), "clay")
  assert.equal(eventTone({ class: "gap_loss", decision: "noise" }), "muted")
  assert.equal(eventTone({ class: "mystery", decision: null }), "muted")
})
