import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  MAX_LIMIT, buildEventsPipeline, buildEventsQuery, eventPath, eventsUrl, evidenceRows, listCaption, matchesFilter, neighbourId,
  nextLimit, nextWaitingId, parseEventFilter, rankEvents, rankKey,
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

test("impossible dates are refused, so NaN cannot skip the 31-day limit", () => {
  for (const qs of ["from=2026-01-01&to=9999-99-99", "from=2026-02-30&to=2026-03-01", "from=2026-10-01&to=2026-1-05"]) {
    assert.equal(parse(qs).ok, false, qs)
  }
  assert.match(parse("from=2026-01-01&to=2026-03-01").error, /31/)
  assert.equal(parse("from=2026-09-05&to=2026-10-05").ok, true)
  assert.equal(parse("from=2026-09-04&to=2026-10-05").ok, false)
})

// ตัวประเมิน expression ของ Mongo เท่าที่ขั้น _rank ใช้ ($ifNull / $max / $multiply)
function evalExpr(expr, doc) {
  if (typeof expr === "string" && expr.startsWith("$")) return doc[expr.slice(1)]
  if (expr === null || typeof expr !== "object") return expr
  const [op, args] = Object.entries(expr)[0]
  const v = args.map((a) => evalExpr(a, doc))
  if (op === "$ifNull") return v[0] ?? v[1]
  if (op === "$max") return Math.max(...v.filter((x) => x != null))
  if (op === "$multiply") return v.reduce((a, b) => a * b, 1)
  throw new Error(`unexpected operator ${op}`)
}

test("the queue is ranked in Mongo before the limit, in rankEvents order", () => {
  const filter = parse("from=2026-10-04&to=2026-10-05&status=all&limit=3").value
  const pipeline = buildEventsPipeline(filter)
  assert.deepEqual(pipeline[0], { $match: buildEventsQuery(filter) })
  assert.deepEqual(pipeline[2], { $sort: { _rank: -1, start: 1 } })
  assert.deepEqual(pipeline[3], { $limit: 3 })
  assert.deepEqual(pipeline[4], { $project: { features: 0, _rank: 0 } })
  const all = [...events, { ...events[0], _id: "x|null-p", p_real_loss: null, litres: 50 }, { ...events[1], _id: "x|negative", litres: -5 }]
  const inMongo = all
    .map((e) => ({ id: e._id, rank: evalExpr(pipeline[1].$addFields._rank, e), start: Date.parse(e.start) }))
    .sort((a, b) => b.rank - a.rank || a.start - b.start)
    .map((e) => e.id)
  assert.deepEqual(inMongo, rankEvents(all).map((e) => e._id))
})

test("the list says when it is cut short and offers more, up to the cap", () => {
  assert.equal(listCaption(37, 37), "37 เหตุการณ์ · เรียงตามลิตรที่น่าจะหาย")
  assert.equal(listCaption(100, 979), "แสดง 100 จาก 979 เหตุการณ์ · เรียงตามลิตรที่น่าจะหาย")
  assert.match(listCaption(500, 9000), /^แสดง 500 จาก 9000 เหตุการณ์ .*ลดช่วงวันที่/)
  assert.equal(nextLimit(100, 979), MAX_LIMIT)
  assert.equal(nextLimit(100, 130), 130)
  assert.equal(nextLimit(100, 100), null)
  assert.equal(nextLimit(MAX_LIMIT, 9000), null)
})

test("follow-up decisions have their own filter so they do not vanish among decided", () => {
  const r = parse("status=follow_up")
  assert.equal(r.ok, true)
  assert.deepEqual(buildEventsQuery(r.value), {
    date_key: { $gte: "2026-10-05", $lte: "2026-10-05" }, status: { $in: ["decided"] }, decision: "follow_up",
  })
  const legit = events.find((e) => e.plate === "สบ.71-7463")
  const followUp = { ...legit, decision: "follow_up" }
  assert.equal(matchesFilter(followUp, r.value), true)
  assert.equal(matchesFilter(legit, r.value), false)
  assert.equal(matchesFilter(followUp, parse("status=decided").value), true)
})
