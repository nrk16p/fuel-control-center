import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  MAX_LIMIT, buildEventsQuery, eventPath, eventsUrl, evidenceRows, matchesFilter, neighbourId,
  nextWaitingId, parseEventFilter, rankEvents, rankKey,
} from "./fuel-events.ts"

const events = JSON.parse(readFileSync(new URL("./__fixtures__/fuel-events-sample.json", import.meta.url), "utf8"))
const parse = (qs) => parseEventFilter(new URLSearchParams(qs), "2026-10-05")

test("defaults to yesterday's waiting events", () => {
  const r = parse("")
  assert.equal(r.ok, true)
  assert.deepEqual(r.value, {
    from: "2026-10-05", to: "2026-10-05", status: "waiting", cls: null, source: null,
    branch: null, fleet: null, plant: null, limit: 100,
  })
  assert.deepEqual(buildEventsQuery(r.value), {
    date_key: { $gte: "2026-10-05", $lte: "2026-10-05" }, status: { $in: ["open", "audit"] },
  })
})

test("maps every filter onto the query", () => {
  const r = parse("from=2026-10-01&to=2026-10-05&status=all&class=gap_loss&source=besttech&branch=ลาดกระบัง&fleet=Asia&plant=พะเยา&limit=9999")
  assert.equal(r.value.limit, MAX_LIMIT)
  assert.deepEqual(buildEventsQuery(r.value), {
    date_key: { $gte: "2026-10-01", $lte: "2026-10-05" }, class: "gap_loss", sources: "besttech",
    branch: "ลาดกระบัง", fleet: "Asia", plant: "พะเยา",
  })
})

test("rejects bad input", () => {
  for (const qs of ["from=05/10/2026", "from=2026-10-05&to=2026-10-01", "from=2026-08-01&to=2026-10-05",
    "status=pending", "class=theft", "source=gps"]) {
    assert.equal(parse(qs).ok, false, qs)
  }
})

test("fixture filtering matches the Mongo query semantics", () => {
  const plates = (qs) => events.filter((e) => matchesFilter(e, parse(qs).value)).map((e) => e.plate)
  assert.deepEqual(plates(""), ["สบ.71-8635", "สบ.70-6303", "สบ.72-8334"])
  assert.equal(plates("from=2026-10-04&to=2026-10-05&status=all").length, 6)
  assert.deepEqual(plates("status=all&class=noise"), ["สบ.72-8334", "สบ.72-9520"])
  assert.deepEqual(plates("status=all&source=terminus"), ["สบ.71-8635", "สบ.72-9520"])
  assert.deepEqual(plates("status=decided&from=2026-10-04"), ["สบ.71-8622"])
})

test("ranks by likely litres lost, then by start time", () => {
  assert.deepEqual(rankEvents(events).map((e) => e.plate),
    ["สบ.71-8622", "สบ.71-8635", "สบ.70-6303", "สบ.72-8334", "สบ.72-9520", "สบ.71-7463"])
  assert.equal(Math.round(rankKey(events[0]) * 100) / 100, 28.19)
  const tie = rankEvents([
    { id: "b", p_real_loss: 0, litres: 0, start: "2026-10-05T03:00:00Z" },
    { id: "a", p_real_loss: 0, litres: 0, start: new Date("2026-10-05T01:00:00Z") },
  ])
  assert.deepEqual(tie.map((e) => e.id), ["a", "b"])
})

test("events URL drops empty values and round-trips through the parser", () => {
  assert.equal(eventsUrl({}), "/api/fuel/events")
  const url = eventsUrl({ from: "2026-10-01", to: "", status: "all", class: null, source: undefined, branch: "ลาดกระบัง", limit: 50 })
  const r = parseEventFilter(new URL(url, "http://local").searchParams, "2026-10-05")
  assert.deepEqual([r.value.from, r.value.to, r.value.status, r.value.cls, r.value.branch, r.value.limit],
    ["2026-10-01", "2026-10-01", "all", null, "ลาดกระบัง", 50])
})

test("event paths survive Thai characters and pipes", () => {
  const id = "สบ.71-8635|2026-10-05T02:10"
  const path = eventPath(id)
  assert.ok(path.startsWith("/api/fuel/events/") && !path.includes("|"))
  assert.equal(decodeURIComponent(path.slice("/api/fuel/events/".length)), id)
})

test("keyboard navigation moves through the list; saving jumps to the next waiting event", () => {
  const ids = ["a", "b", "c"]
  assert.equal(neighbourId(ids, null, 1), "a")
  assert.equal(neighbourId(ids, null, -1), "c")
  assert.equal(neighbourId(ids, "b", 1), "c")
  assert.equal(neighbourId(ids, "c", 1), "c")
  assert.equal(neighbourId([], "a", 1), null)
  const list = [{ _id: "a", status: "decided" }, { _id: "b", status: "open" }, { _id: "c", status: "decided" }, { _id: "d", status: "audit" }]
  assert.equal(nextWaitingId(list, "b"), "d")
  assert.equal(nextWaitingId(list, "d"), "b")
  assert.equal(nextWaitingId([{ _id: "a", status: "decided" }], "a"), null)
})

test("evidence rows show size first and only the features that exist", () => {
  assert.deepEqual(evidenceRows(events[0]), [
    { label: "ปริมาณ", value: "32.4 L (16.2% ของถัง)" },
    { label: "ระยะเวลา", value: "25 นาที" },
    { label: "เครื่องดับระหว่างเหตุการณ์", value: "100%" },
    { label: "ระดับกลับขึ้นใน 2 ชม.", value: "ไม่" },
    { label: "กลางคืน", value: "ใช่" },
    { label: "อยู่ในแพลนท์/อู่", value: "ไม่" },
    { label: "เห็นตรงกันทั้ง 2 กล่อง GPS", value: "ใช่" },
  ])
  assert.deepEqual(evidenceRows(events[4]).at(-1), { label: "สถานที่", value: "ลานจอดริมถนน" })
})
