# Fuel Redesign Part 3 — New `/fueldetection` Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/fueldetection` with three tabs — คิวตรวจสอบ (ranked event queue + event panel + one-click decisions), รายคัน (truck view over `gps_series`, both GPS vendors), สรุป & สถานะข้อมูล (report, data status, settings) — backed by new `/api/fuel/*` routes.

**Architecture:** All logic that can be pure lives in small `src/lib` modules tested with `node --test` (filters → Mongo query, ranking, decision validation and review documents, series decoding/slicing, report aggregation, settings validation, Thai time). Route handlers compose those modules with Mongo and next-auth; React components only render and call the routes. The page works before Part 2 ships: with `FUEL_FIXTURES=1` (development only) every `/api/fuel/*` route serves JSON fixtures instead of `fuel_events` / `fuel_daily_summary`.

**Tech Stack:** Next.js 16 (App Router) · React 19 · next-auth 4 · MongoDB driver 7 (bson 7) · Chart.js 4 + chartjs-plugin-zoom · react-leaflet 5 · xlsx · Node 25 `node --test` with TypeScript type stripping.

**Spec:** `docs/superpowers/specs/2026-10-06-fuel-detection-redesign-design.md` — Part 3 is §5; data contracts §3.1 (`gps_series`), §4.6 (`fuel_settings`), §4.7 (`fuel_events`), §4.8 (`fuel_daily_summary`). Part 1's decoder is `src/lib/series-codec.ts` (already on this branch). Field names follow the Part 2 plan (`docs/superpowers/plans/2026-10-06-fuel-part2-detection-ml.md`, Global Constraints): `features.level_before` / `level_after` / `both_boxes`, `fuel_settings.price_per_litre` defaults to `null` (the report shows litres only), `fuel_daily_summary.by_status.sparse`, and nightly re-runs write events with `ReplaceOne` (an open event can come back under a new `_id`).

**Deliberate deviations from spec §5:** `GET /api/fuel/events` takes `limit` instead of `cursor` (the queue order `p_real_loss × litres` is computed, so the route ranks up to 2,000 documents in memory); the new page gets its own `DecisionBar`, and `ReviewPanel.tsx` stays with the legacy page and is deleted with it; the `fleet` / `branch` / `plant` filters and the by-plant report read those fields when present — neither spec §4.7 nor the Part 2 plan writes them yet.

## Global Constraints

- Work only in the worktree `~/Documents/project/fuel-control-center/fcc-fuel`, branch `feat/fuel-redesign`. Never push; never commit to `main`.
- `node_modules` is a symlink to the main checkout — never run `npm install`, add no dependencies.
- Tested modules (`src/lib/thai-time.ts`, `fuel-events.ts`, `fuel-decision.ts`, `fuel-series.ts`, `fuel-report.ts`, `fuel-settings.ts`) use erasable TypeScript only (no `enum`, `namespace`, parameter properties) and may import other modules **only with `import type`**; runtime collaborators (the series codec) are passed in as arguments. Node's type stripping runs them under `node --test` and does not resolve extensionless specifiers.
- Test gate: `npm test` (runs `node --test "src/**/*.test.mjs"`). Type gate: `node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false` exits 0 with no output (baseline on 2026-10-06: 0 errors).
- Lint gate: `node_modules/.bin/eslint <changed files>` reports 0 errors (React Compiler rules `react-hooks/purity`, `refs`, `set-state-in-effect`, `immutability` and `@typescript-eslint/no-explicit-any` are errors in this repo). Never call `Date.now()` / `Math.random()` during render; never `setState` synchronously inside an effect body; never read `ref.current` during render.
- Build gate (Task 13, spec §7): `npm run build` (Turbopack, as on Vercel) succeeds. It needs `.env.local` (`src/lib/mongodb.ts` throws at import without `MONGO_URI`) and a real `node_modules`: Turbopack refuses this worktree's symlink ("Symlink node_modules is invalid, it points out of the filesystem root"), so Task 13 swaps it for an APFS clone of the same packages (no install, no network). Do not use `next build --webpack` as the gate: it fails on two pre-existing files (`src/app/api/pipeline/[type]/route.ts`, `src/app/engineon/[detail]/page.tsx`, both typing `params` as `Promise | object`) that Turbopack accepts.
- Mongo writes happen only in `POST /api/fuel/events/[id]/decision` (insert into `fuel_drop_reviews`, update one `fuel_events` doc, and delete that review again if a nightly re-run replaced the event in between) and `PUT /api/fuel/settings` (`$set` of exactly `auto_close_conf`, `audit_rate`, `price_per_litre`, `updated_at`, `updated_by` on `fuel_settings` `_id: "default"` — other fields in that doc belong to Part 2 and are never overwritten). Both require a next-auth session; the reviewer is the session email.
- `fuel_drop_reviews.plate` keeps the legacy form `71-8623` so `/dashboard` and the legacy page keep grouping old and new reviews; `plate_norm` stores the `gps_series` plate `สบ.71-8623`. New fields: `event_id`, `suggestion`, `scorer`, `audit` (the event was an audit pick); decisions use the new vocabulary `real_loss` · `noise` · `legit` · `follow_up` (spec §5.3). The report finds audit picks through these reviews, because a nightly re-run replaces event documents wholesale.
- `FUEL_FIXTURES=1` is honoured only when `NODE_ENV !== "production"`; in fixture mode no route writes anything.
- `ai_text` is never rendered (no AI in this project).
- UI follows the Cozy Green tokens already in `globals.css` (`bg-surface`, `bg-cream`, `border-line`, `border-line-input`, `text-ink`, `text-body`, `text-muted-ink`, `bg-forest`, `text-forest`, `bg-mint`, `text-clay`, `bg-butter`), cards `rounded-[22px]`, Thai labels, single column on phones with the event panel full-screen below `lg`.
- The old page moves to `/fueldetection/legacy` and stays for one week; `/api/fuel-detection` and the browser-side detection in `src/lib/fuel-analysis.ts` are removed together with it later (not in this plan).

## Review Focus

- Event `_id`s contain `|` and Thai characters (`สบ.71-8635|2026-10-05T02:10`); every client URL must `encodeURIComponent` them exactly once — Task 2 `event paths survive Thai characters and pipes`.
- Minutes without a valid fuel reading must stay `null` (a gap in the chart, never a zero dip) and the chart tooltip must not crash on them — Task 4 `builds one ordered series per source in litres` (asserts the `null`), Task 8 null-safe tooltip (manual check in Task 13).
- A second decision on an already-decided event must become a revision (`revision_of` = previous review id), never a silent overwrite — Task 3 `a second decision becomes a revision and refuels count as negative`.
- "Real loss" without a note must be refused by the server, not only by the disabled button — Task 3 `refuses unknown decisions and real_loss without a note`; the route uses the same validator (curl check in Task 13).
- Event windows that cross Thai midnight (±3 h padding) must load both days of `gps_series` — Task 1 `event windows crossing midnight cover both days`.

---

### Task 1: Thai time module

**Files:**
- Create: `src/lib/thai-time.ts`
- Modify: `src/lib/fuel-analysis.ts` (display helpers move out; it re-exports them)
- Test: `src/lib/thai-time.test.mjs`

**Interfaces:**
- Produces: `TH_OFFSET_MS`, `DAY_MS`, `thaiHour(ts)`, `fmtThaiTime(ts)`, `fmtThaiDay(ts)`, `fmtThaiDateTime(ts)`, `thaiMidnight(ts)`, `thaiDateKey(ts) → "YYYY-MM-DD"`, `dayStartMs(dateKey)`, `addDays(dateKey, n)`, `yesterdayKey(nowMs)`, `dateKeysBetween(fromKey, toKey)`, `windowDateKeys(startMs, endMs, padMs)`, `fmtDateKey(dateKey) → "5 ต.ค."`. `fuel-analysis.ts` keeps exporting `thaiHour`, `fmtThaiTime`, `fmtThaiDay`, `fmtThaiDateTime`, `thaiMidnight` (re-exported), so existing imports keep working.

- [ ] **Step 1: Write the failing test**

`src/lib/thai-time.test.mjs`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/thai-time.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND … src/lib/thai-time.ts`.

- [ ] **Step 3: Implement `src/lib/thai-time.ts`**

```ts
// เวลาไทย (UTC+7) — ไม่พึ่งโมดูลอื่น ใช้ได้ทั้งฝั่ง Next และใต้ `node --test`
// fuel-analysis.ts re-export ฟังก์ชันแสดงผลจากไฟล์นี้

export const TH_OFFSET_MS = 7 * 3_600_000
export const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const pad = (n: number) => String(n).padStart(2, "0")
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

/** ชั่วโมงในเวลาไทย (0–23.99) */
export const thaiHour = (ts: number) => ((((ts + TH_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS

export const fmtThaiTime = (ts: number) => {
  const d = new Date(ts + TH_OFFSET_MS)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export const fmtThaiDay = (ts: number) => {
  const d = new Date(ts + TH_OFFSET_MS)
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`
}

export const fmtThaiDateTime = (ts: number) => `${fmtThaiDay(ts)} ${fmtThaiTime(ts)}`

/** เที่ยงคืนเวลาไทยของวันที่ ts อยู่ */
export const thaiMidnight = (ts: number) => Math.floor((ts + TH_OFFSET_MS) / DAY_MS) * DAY_MS - TH_OFFSET_MS

/** "YYYY-MM-DD" ตามวันเวลาไทย — รูปแบบเดียวกับ date_key ใน analytics */
export function thaiDateKey(ts: number): string {
  const d = new Date(ts + TH_OFFSET_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 00:00 เวลาไทยของ date_key → epoch ms */
export function dayStartMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number)
  return Date.UTC(y, m - 1, d) - TH_OFFSET_MS
}

export const addDays = (dateKey: string, days: number) => thaiDateKey(dayStartMs(dateKey) + days * DAY_MS)

export const yesterdayKey = (nowMs: number) => addDays(thaiDateKey(nowMs), -1)

/** ทุก date_key ตั้งแต่ from ถึง to (รวมปลายทั้งสอง) */
export function dateKeysBetween(fromKey: string, toKey: string): string[] {
  const keys: string[] = []
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) keys.push(key)
  return keys
}

/** ทุกวันที่ช่วง [start − pad, end + pad] แตะ — เหตุการณ์ข้ามเที่ยงคืนต้องดึง gps_series ทั้งสองวัน */
export const windowDateKeys = (startMs: number, endMs: number, padMs: number) =>
  dateKeysBetween(thaiDateKey(startMs - padMs), thaiDateKey(endMs + padMs))

/** "2026-10-05" → "5 ต.ค." */
export const fmtDateKey = (dateKey: string) => fmtThaiDay(dayStartMs(dateKey))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/lib/thai-time.test.mjs`
Expected: `ℹ pass 5` · `ℹ fail 0`.

- [ ] **Step 5: Make `fuel-analysis.ts` re-export the helpers**

The block from `/* ---------- เวลาไทย (UTC+7) สำหรับแสดงผล ---------- */` up to (not including) `/** หา index ของจุดที่ ts ใกล้ที่สุด` is replaced by a re-export:
```bash
python3 - <<'EOF'
from pathlib import Path
p = Path("src/lib/fuel-analysis.ts")
s = p.read_text()
start = s.index("/* ---------- เวลาไทย (UTC+7) สำหรับแสดงผล ---------- */")
end = s.index("/** หา index ของจุดที่ ts ใกล้ที่สุด")
s = s[:start] + (
    "/* ---------- เวลาไทย (UTC+7) สำหรับแสดงผล — ย้ายไป src/lib/thai-time.ts ---------- */\n"
    'export { fmtThaiDateTime, fmtThaiDay, fmtThaiTime, thaiHour, thaiMidnight } from "./thai-time"\n\n'
) + s[end:]
p.write_text(s)
EOF
grep -n "thai-time" src/lib/fuel-analysis.ts
```
Expected: one `export { … } from "./thai-time"` line.

- [ ] **Step 6: Run the gates**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/lib/thai-time.ts src/lib/fuel-analysis.ts
```
Expected: `ℹ fail 0`; `tsc-ok`; eslint prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/thai-time.ts src/lib/thai-time.test.mjs src/lib/fuel-analysis.ts
git commit -m "feat(fuel): Thai time helpers module (date keys, windows) shared by the new page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Data types, fixtures and queue logic

**Files:**
- Create: `src/lib/fuel-types.ts`
- Create: `src/lib/__fixtures__/fuel-events-sample.json`, `src/lib/__fixtures__/fuel-summary-sample.json`
- Create: `src/lib/fuel-events.ts`
- Test: `src/lib/fuel-events.test.mjs`

**Interfaces:**
- Produces (types): `Source`, `EventKind`, `EventClass`, `EventStatus`, `Suggestion`, `Decision`, `CoverageStatus`, `EventPlace`, `FuelEvent` (JSON form, `start`/`end` ISO strings), `FuelEventDoc` (stored form, `start`/`end` `Date`, `review_id: unknown`, `updated_at?: Date`), `DailySummary`, `FuelSettings`, `CoverageRow`.
- Produces (logic): `STATUS_FILTERS`, `StatusFilter`, `EVENT_CLASSES`, `SOURCES`, `MAX_RANGE_DAYS = 31`, `EventFilter`, `Parsed<T>`, `parseEventFilter(params, defaultDay)`, `buildEventsQuery(filter)`, `matchesFilter(event, filter)`, `rankKey(event)`, `rankEvents(events)`, `eventsUrl(input)`, `eventPath(id)`, `neighbourId(ids, current, step)`, `nextWaitingId(events, current)`, `evidenceRows(event)`.

- [ ] **Step 1: Create `src/lib/fuel-types.ts`**

```ts
// รูปร่างข้อมูลที่หน้า /fueldetection อ่าน — spec §3.1, §4.6–4.8 (Part 2 เขียน fuel_events / fuel_daily_summary)
// มีแต่ type: import ได้จากทุกที่ (รวมโมดูลที่รันใต้ node --test) ด้วย `import type`

export type Source = "besttech" | "terminus"
export type EventKind = "drop" | "refuel" | "gap"
export type EventClass = "noise" | "consumption" | "refuel" | "sensor_fault" | "suspected_loss" | "gap_loss"
export type EventStatus = "open" | "auto_closed" | "audit" | "decided"
export type Suggestion = "real_loss" | "noise" | "legit"
export type Decision = Suggestion | "follow_up"
export type CoverageStatus = "ok" | "no_sensor" | "offline" | "stuck" | "no_data"

export type EventPlace = { name: string | null; lat: number | null; lng: number | null }

/** analytics.fuel_events ในรูปที่ API ส่งออก (Date → ISO string, ObjectId → hex) */
export type FuelEvent = {
  _id: string
  plate: string
  truck_code: string | null
  driver: string | null
  /** spec §5.1 ตัวกรอง/รายงานตามสาขา-ฟลีท-แพลนท์ — Part 2 ยังไม่เขียน จึงอ่านเมื่อมีเท่านั้น */
  fleet?: string | null
  branch?: string | null
  plant?: string | null
  date_key: string
  start: string
  end: string
  sources: Source[]
  kind: EventKind
  class: EventClass
  litres: number
  pct_tank: number | null
  score: number
  p_real_loss: number
  suggestion: Suggestion
  confidence: number
  reasons: string[]
  action: string | null
  /** หลักฐาน spec §4.3 + ของ Part 2 (level_before, level_after, both_boxes, …) — รายการคิวตัดออกด้วย projection */
  features?: Record<string, number | boolean | string | null>
  place: EventPlace | null
  status: EventStatus
  decision: Decision | null
  review_id: string | null
  scorer: string
  stale: boolean
  /** Part 3 ตั้งเป็น true ตอนตัดสินเหตุการณ์ที่มาจากการตรวจสุ่ม */
  audit?: boolean
  created_at?: string
  updated_at?: string
}

/** analytics.fuel_events ตามที่เก็บจริง (Part 2 เขียน start/end เป็น Date, review_id เป็น ObjectId) */
export type FuelEventDoc = Omit<FuelEvent, "start" | "end" | "review_id" | "created_at" | "updated_at"> & {
  start: Date
  end: Date
  review_id: unknown
  created_at?: Date
  updated_at?: Date
}

export type DailySummary = {
  _id: string
  trucks_expected: number
  trucks_analysed: number
  by_status: Partial<Record<CoverageStatus | "sparse", number>>
  events: number
  auto_closed: number
  open: number
  audit: number
  decided?: number
  likely_litres: number
  check_first: string[]
  sources_missing: Source[]
  ai_text: string | null
}

/** price_per_litre = null จนกว่าทีมจะตั้ง (รายงานแสดงแค่ลิตร) — ตรงกับ DEFAULTS ของ Part 2 */
export type FuelSettings = { auto_close_conf: number; audit_rate: number; price_per_litre: number | null }

export type CoverageRow = {
  plate: string
  source: Source
  truck_code: string | null
  status: CoverageStatus
  minutes: number
  fuel_valid_share: number
  last: string | null
  moved_km: number
  tank_l: number
  tank_from: string
}
```

- [ ] **Step 2: Create the fixtures**

`src/lib/__fixtures__/fuel-events-sample.json`:
```json
[
  {
    "_id": "สบ.71-8635|2026-10-05T02:10", "plate": "สบ.71-8635", "truck_code": "ME152", "driver": "คนขับ A",
    "fleet": "Asia", "branch": "ลาดกระบัง", "plant": "พะเยา", "date_key": "2026-10-05",
    "start": "2026-10-04T19:10:00.000Z", "end": "2026-10-04T19:35:00.000Z", "sources": ["besttech", "terminus"],
    "kind": "drop", "class": "suspected_loss", "litres": 32.4, "pct_tank": 16.2, "score": 87, "p_real_loss": 0.87,
    "suggestion": "real_loss", "confidence": 0.87,
    "reasons": ["จอดดับเครื่อง", "2 ชม. ต่อมาระดับไม่กลับขึ้น", "ไม่ได้อยู่ในแพลนท์/อู่", "กลางคืน"],
    "action": "เทียบใบเติมน้ำมัน + สอบถามคนขับ",
    "features": { "level_before": 120.0, "level_after": 87.6, "duration_min": 25, "engine_off_share": 1, "recovered_120": false, "night": true, "at_place": false, "both_boxes": true },
    "place": { "name": null, "lat": 13.79576, "lng": 100.55717 },
    "status": "open", "decision": null, "review_id": null, "scorer": "rules-v1", "stale": false
  },
  {
    "_id": "สบ.70-6303|2026-10-05T14:05", "plate": "สบ.70-6303", "truck_code": "ME148", "driver": null,
    "fleet": "Asia", "branch": "ลาดกระบัง", "plant": null, "date_key": "2026-10-05",
    "start": "2026-10-05T07:05:00.000Z", "end": "2026-10-05T07:50:00.000Z", "sources": ["besttech"],
    "kind": "gap", "class": "gap_loss", "litres": 18.0, "pct_tank": 9.0, "score": 62, "p_real_loss": 0.62,
    "suggestion": "real_loss", "confidence": 0.62,
    "reasons": ["กล่อง GPS ขาดสัญญาณ 45 นาที", "ระดับหลังสัญญาณกลับต่ำกว่าเดิม 18 L"],
    "action": "ตรวจกล่อง GPS/สายไฟ ว่าถูกตัดไฟหรือไม่",
    "features": { "gap_min": 45, "level_before": 140.0, "level_after": 122.0 },
    "place": null,
    "status": "open", "decision": null, "review_id": null, "scorer": "rules-v1", "stale": false
  },
  {
    "_id": "สบ.72-8334|2026-10-05T09:40", "plate": "สบ.72-8334", "truck_code": "ME212", "driver": null,
    "fleet": "Asia", "branch": "ลาดกระบัง", "plant": "พะเยา", "date_key": "2026-10-05",
    "start": "2026-10-05T02:40:00.000Z", "end": "2026-10-05T02:52:00.000Z", "sources": ["besttech"],
    "kind": "drop", "class": "noise", "litres": 9.5, "pct_tank": 4.8, "score": 0, "p_real_loss": 0.03,
    "suggestion": "noise", "confidence": 0.97,
    "reasons": ["ระดับกลับขึ้นภายใน 30 นาที", "เกิดระหว่างรถวิ่ง"],
    "action": null,
    "features": { "recovered_30": true },
    "place": null,
    "status": "audit", "decision": null, "review_id": null, "scorer": "rules-v1", "stale": false
  },
  {
    "_id": "สบ.71-7463|2026-10-05T11:20", "plate": "สบ.71-7463", "truck_code": "ME081", "driver": null,
    "fleet": "Asia", "branch": "ลาดกระบัง", "plant": null, "date_key": "2026-10-05",
    "start": "2026-10-05T04:20:00.000Z", "end": "2026-10-05T04:31:00.000Z", "sources": ["besttech"],
    "kind": "refuel", "class": "refuel", "litres": 80.0, "pct_tank": 40.0, "score": 0, "p_real_loss": 0.0,
    "suggestion": "legit", "confidence": 1.0,
    "reasons": ["เพิ่มขึ้น 80 L และคงอยู่"],
    "action": null,
    "features": {},
    "place": null,
    "status": "decided", "decision": "legit", "review_id": "6701a0000000000000000001", "scorer": "rules-v1", "stale": false
  },
  {
    "_id": "สบ.71-8622|2026-10-04T23:15", "plate": "สบ.71-8622", "truck_code": "ME160", "driver": "คนขับ B",
    "fleet": "Asia", "branch": "ลาดกระบัง", "plant": "บางนา", "date_key": "2026-10-04",
    "start": "2026-10-04T16:15:00.000Z", "end": "2026-10-04T16:50:00.000Z", "sources": ["besttech"],
    "kind": "drop", "class": "suspected_loss", "litres": 41.0, "pct_tank": 20.5, "score": 91, "p_real_loss": 0.91,
    "suggestion": "real_loss", "confidence": 0.91,
    "reasons": ["จอดดับเครื่อง", "กลางคืน"],
    "action": "เทียบใบเติมน้ำมัน + สอบถามคนขับ",
    "features": { "level_before": 150.0, "level_after": 109.0 },
    "place": { "name": "ลานจอดริมถนน", "lat": 13.7, "lng": 100.6 },
    "status": "decided", "decision": "real_loss", "review_id": "6701a0000000000000000002", "scorer": "rules-v1", "stale": false
  },
  {
    "_id": "สบ.72-9520|2026-10-05T16:00", "plate": "สบ.72-9520", "truck_code": null, "driver": null,
    "fleet": null, "branch": null, "plant": null, "date_key": "2026-10-05",
    "start": "2026-10-05T09:00:00.000Z", "end": "2026-10-05T09:06:00.000Z", "sources": ["terminus"],
    "kind": "drop", "class": "noise", "litres": 6.0, "pct_tank": 7.5, "score": 0, "p_real_loss": 0.01,
    "suggestion": "noise", "confidence": 0.99,
    "reasons": ["กระโดดค่าเดียวแล้วกลับ"],
    "action": null,
    "place": null,
    "status": "auto_closed", "decision": null, "review_id": null, "scorer": "rules-v1", "stale": false
  }
]
```

`src/lib/__fixtures__/fuel-summary-sample.json`:
```json
{
  "_id": "2026-10-05",
  "trucks_expected": 560,
  "trucks_analysed": 537,
  "by_status": { "ok": 512, "stuck": 11, "no_sensor": 14, "offline": 6, "no_data": 17 },
  "events": 37,
  "auto_closed": 28,
  "open": 7,
  "audit": 2,
  "likely_litres": 96.4,
  "check_first": ["สบ.71-8635|2026-10-05T02:10", "สบ.70-6303|2026-10-05T14:05"],
  "sources_missing": [],
  "ai_text": null
}
```

- [ ] **Step 3: Write the failing test**

`src/lib/fuel-events.test.mjs`:
```js
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test src/lib/fuel-events.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND … src/lib/fuel-events.ts`.

- [ ] **Step 5: Implement `src/lib/fuel-events.ts`**

```ts
// คิวเหตุการณ์น้ำมัน (spec §5.1–5.2): ตัวกรองจาก URL → query ของ fuel_events, การเรียงตามลิตรที่น่าจะหาย,
// การเลื่อนไปเหตุการณ์ถัดไป และหลักฐานที่แสดงในแผงรายละเอียด
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { EventClass, EventStatus, FuelEvent, Source } from "./fuel-types"

export const STATUS_FILTERS = ["waiting", "decided", "auto_closed", "audit", "all"] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_GROUPS: Record<StatusFilter, EventStatus[] | null> = {
  waiting: ["open", "audit"],
  decided: ["decided"],
  auto_closed: ["auto_closed"],
  audit: ["audit"],
  all: null,
}
export const EVENT_CLASSES: readonly EventClass[] = ["suspected_loss", "gap_loss", "noise", "consumption", "refuel", "sensor_fault"]
export const SOURCES: readonly Source[] = ["besttech", "terminus"]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_RANGE_DAYS = 31
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 500

export type EventFilter = {
  from: string
  to: string
  status: StatusFilter
  cls: EventClass | null
  source: Source | null
  branch: string | null
  fleet: string | null
  plant: string | null
  limit: number
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseEventFilter(params: URLSearchParams, defaultDay: string): Parsed<EventFilter> {
  const from = params.get("from") || defaultDay
  const to = params.get("to") || from
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return { ok: false, error: "from / to ต้องเป็น YYYY-MM-DD" }
  if (to < from) return { ok: false, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
    return { ok: false, error: `เลือกได้ไม่เกิน ${MAX_RANGE_DAYS} วัน` }
  }
  const status = params.get("status") || "waiting"
  if (!(STATUS_FILTERS as readonly string[]).includes(status)) return { ok: false, error: "status ไม่ถูกต้อง" }
  const cls = params.get("class") || null
  if (cls && !(EVENT_CLASSES as readonly string[]).includes(cls)) return { ok: false, error: "ประเภทเหตุการณ์ไม่ถูกต้อง" }
  const source = params.get("source") || null
  if (source && !(SOURCES as readonly string[]).includes(source)) return { ok: false, error: "แหล่ง GPS ไม่ถูกต้อง" }
  const rawLimit = Number(params.get("limit") || DEFAULT_LIMIT)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT) : DEFAULT_LIMIT
  const text = (key: string) => params.get(key)?.trim() || null
  return {
    ok: true,
    value: {
      from,
      to,
      status: status as StatusFilter,
      cls: cls as EventClass | null,
      source: source as Source | null,
      branch: text("branch"),
      fleet: text("fleet"),
      plant: text("plant"),
      limit,
    },
  }
}

export function buildEventsQuery(filter: EventFilter): Record<string, unknown> {
  const query: Record<string, unknown> = { date_key: { $gte: filter.from, $lte: filter.to } }
  const statuses = STATUS_GROUPS[filter.status]
  if (statuses) query.status = { $in: statuses }
  if (filter.cls) query.class = filter.cls
  if (filter.source) query.sources = filter.source
  if (filter.branch) query.branch = filter.branch
  if (filter.fleet) query.fleet = filter.fleet
  if (filter.plant) query.plant = filter.plant
  return query
}

/** ความหมายเดียวกับ buildEventsQuery — ใช้กรอง fixture ในโหมดตัวอย่าง */
export function matchesFilter(
  e: Pick<FuelEvent, "date_key" | "status" | "class" | "sources" | "branch" | "fleet" | "plant">,
  filter: EventFilter,
): boolean {
  const statuses = STATUS_GROUPS[filter.status]
  return (
    e.date_key >= filter.from &&
    e.date_key <= filter.to &&
    (!statuses || statuses.includes(e.status)) &&
    (!filter.cls || e.class === filter.cls) &&
    (!filter.source || e.sources.includes(filter.source)) &&
    (!filter.branch || e.branch === filter.branch) &&
    (!filter.fleet || e.fleet === filter.fleet) &&
    (!filter.plant || e.plant === filter.plant)
  )
}

/** ลิตรที่น่าจะหาย = p_real_loss × litres (ตัวเรียงคิว) */
export const rankKey = (e: Pick<FuelEvent, "p_real_loss" | "litres">) => (e.p_real_loss || 0) * Math.max(e.litres || 0, 0)

type Rankable = Pick<FuelEvent, "p_real_loss" | "litres"> & { start: string | Date }

export function rankEvents<T extends Rankable>(events: T[]): T[] {
  return [...events].sort((a, b) => rankKey(b) - rankKey(a) || new Date(a.start).getTime() - new Date(b.start).getTime())
}

/** /api/fuel/events?… — ข้ามค่าว่าง */
export function eventsUrl(input: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `/api/fuel/events?${qs}` : "/api/fuel/events"
}

/** URL ของเหตุการณ์หนึ่งตัว — _id มี "|" และอักษรไทยจึงต้อง encode */
export const eventPath = (id: string) => `/api/fuel/events/${encodeURIComponent(id)}`

/** J/K: ตัวถัดไป/ก่อนหน้าในรายการ (หยุดที่ปลาย) */
export function neighbourId(ids: string[], current: string | null, step: 1 | -1): string | null {
  if (!ids.length) return null
  const at = current ? ids.indexOf(current) : -1
  if (at < 0) return step > 0 ? ids[0] : ids[ids.length - 1]
  const next = at + step
  return next >= 0 && next < ids.length ? ids[next] : ids[at]
}

const isWaiting = (e: Pick<FuelEvent, "status">) => e.status === "open" || e.status === "audit"

/** หลังบันทึก: เหตุการณ์ที่ยังรอตรวจตัวถัดไป (วนกลับต้นรายการ) */
export function nextWaitingId(events: Pick<FuelEvent, "_id" | "status">[], current: string): string | null {
  const at = events.findIndex((e) => e._id === current)
  for (let i = at + 1; i < events.length; i++) if (isWaiting(events[i])) return events[i]._id
  for (let i = 0; i < at; i++) if (isWaiting(events[i])) return events[i]._id
  return null
}

const yesNo = (v: number | boolean | string) => (v ? "ใช่" : "ไม่")
const FEATURE_ROWS: [string, string, (v: number | boolean | string) => string][] = [
  ["duration_min", "ระยะเวลา", (v) => `${v} นาที`],
  ["rate_l_per_min", "อัตรา", (v) => `${Number(v).toFixed(1)} L/นาที`],
  ["excess_over_burn_l", "เกินการใช้ปกติ", (v) => `${Number(v).toFixed(1)} L`],
  ["engine_off_share", "เครื่องดับระหว่างเหตุการณ์", (v) => `${Math.round(Number(v) * 100)}%`],
  ["recovered_120", "ระดับกลับขึ้นใน 2 ชม.", yesNo],
  ["gap_min", "สัญญาณขาดนานสุด", (v) => `${v} นาที`],
  ["sensor_noise_parked", "สัญญาณรบกวนของเซนเซอร์", (v) => `${Number(v).toFixed(1)}% ของถัง`],
  ["night", "กลางคืน", yesNo],
  ["at_place", "อยู่ในแพลนท์/อู่", yesNo],
  ["both_boxes", "เห็นตรงกันทั้ง 2 กล่อง GPS", yesNo],
]

/** หลักฐานในแผงรายละเอียด: ขนาดก่อน แล้วเฉพาะ feature ที่ Part 2 ส่งมา */
export function evidenceRows(e: Pick<FuelEvent, "litres" | "pct_tank" | "features" | "place">): { label: string; value: string }[] {
  const pct = e.pct_tank != null ? ` (${e.pct_tank.toFixed(1)}% ของถัง)` : ""
  const rows = [{ label: "ปริมาณ", value: `${e.litres.toFixed(1)} L${pct}` }]
  for (const [key, label, format] of FEATURE_ROWS) {
    const value = e.features?.[key]
    if (value !== undefined && value !== null) rows.push({ label, value: format(value) })
  }
  if (e.place?.name) rows.push({ label: "สถานที่", value: e.place.name })
  return rows
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test src/lib/fuel-events.test.mjs`
Expected: `ℹ pass 9` · `ℹ fail 0`.

- [ ] **Step 7: Gates and commit**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/lib/fuel-types.ts src/lib/fuel-events.ts
git add src/lib/fuel-types.ts src/lib/fuel-events.ts src/lib/fuel-events.test.mjs src/lib/__fixtures__/fuel-events-sample.json src/lib/__fixtures__/fuel-summary-sample.json
git commit -m "feat(fuel): event types, fixtures, queue filter/ranking logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected before the commit: `ℹ fail 0`, `tsc-ok`, eslint silent.

---

### Task 3: Decision logic

**Files:**
- Create: `src/lib/fuel-decision.ts`
- Test: `src/lib/fuel-decision.test.mjs`

**Interfaces:**
- Consumes: Task 2 types (`Decision`, `EventKind`, `EventStatus`, `Suggestion`).
- Produces: `DECISIONS`, `NOTE_MIN_REAL_LOSS = 5`, `NOTE_MAX = 1000`, `DecisionInput`, `validateDecision(body) → { ok: true; value: DecisionInput } | { ok: false; error }`, `legacyPlate(plate)`, `ReviewSource`, `buildReviewDoc({ event, input, reviewer, now })`, `KeyAction`, `keyAction(key, inTextField)`.

- [ ] **Step 1: Write the failing test**

`src/lib/fuel-decision.test.mjs`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/fuel-decision.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND … src/lib/fuel-decision.ts`.

- [ ] **Step 3: Implement `src/lib/fuel-decision.ts`**

```ts
// การตัดสินเหตุการณ์ (spec §5.1, §5.3): ตรวจ payload, ปุ่มลัด, และเอกสารที่ลง fuel_drop_reviews
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { Decision, EventKind, EventStatus, Suggestion } from "./fuel-types"

export const DECISIONS: readonly Decision[] = ["real_loss", "noise", "legit", "follow_up"]
export const NOTE_MIN_REAL_LOSS = 5
export const NOTE_MAX = 1000

export type DecisionInput = { decision: Decision; note: string }

export function validateDecision(body: unknown): { ok: true; value: DecisionInput } | { ok: false; error: string } {
  const input = (body ?? {}) as { decision?: unknown; note?: unknown }
  if (typeof input.decision !== "string" || !(DECISIONS as readonly string[]).includes(input.decision)) {
    return { ok: false, error: "decision ต้องเป็น real_loss, noise, legit หรือ follow_up" }
  }
  const note = typeof input.note === "string" ? input.note.trim() : ""
  if (input.decision === "real_loss" && note.length < NOTE_MIN_REAL_LOSS) {
    return { ok: false, error: `ยืนยันดูดจริงต้องใส่โน้ตอย่างน้อย ${NOTE_MIN_REAL_LOSS} ตัวอักษร` }
  }
  if (note.length > NOTE_MAX) return { ok: false, error: `โน้ตยาวเกิน ${NOTE_MAX} ตัวอักษร` }
  return { ok: true, value: { decision: input.decision as Decision, note } }
}

/** fuel_drop_reviews.plate ใช้รูปแบบเดิม ("71-8623") ให้ /dashboard และหน้าเดิมจับกลุ่มรีวิวเก่า-ใหม่ด้วยกัน */
export function legacyPlate(plate: string): string {
  const match = /(\d{2})\s*[-–—]\s*(\d{4})/.exec(plate)
  return match ? `${match[1]}-${match[2]}` : plate.trim()
}

export type ReviewSource = {
  _id: string
  plate: string
  kind: EventKind
  litres: number
  start: string | Date
  end: string | Date
  features?: Record<string, unknown> | null
  suggestion: Suggestion
  scorer: string
  status: EventStatus
  audit?: boolean
  review_id: unknown
}

const round2 = (n: number) => Math.round(n * 100) / 100
const numberOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** เอกสารใหม่ใน fuel_drop_reviews — ฟิลด์เดิมครบ (start_ts, end_ts, fuel_start, fuel_end, fuel_diff, duration_min, decision, note, reviewer, revision_of, created_at)
 *  + event_id / suggestion / scorer / audit (spec §5.3) */
export function buildReviewDoc(args: { event: ReviewSource; input: DecisionInput; reviewer: string; now: Date }) {
  const { event, input, reviewer, now } = args
  const startTs = new Date(event.start).getTime()
  const endTs = new Date(event.end).getTime()
  const fuelStart = numberOrNull(event.features?.level_before)
  const fuelEnd = numberOrNull(event.features?.level_after)
  // fuel_diff ตามความหมายเดิม: ต้น − ปลาย (บวก = หาย, การเติมเป็นลบ)
  const fuelDiff =
    fuelStart != null && fuelEnd != null
      ? round2(fuelStart - fuelEnd)
      : round2(event.kind === "refuel" ? -event.litres : event.litres)
  return {
    plate: legacyPlate(event.plate),
    plate_norm: event.plate,
    event_id: event._id,
    start_ts: startTs,
    end_ts: endTs,
    fuel_start: fuelStart,
    fuel_end: fuelEnd,
    fuel_diff: fuelDiff,
    duration_min: Math.round((endTs - startTs) / 60_000),
    decision: input.decision,
    note: input.note,
    reviewer,
    suggestion: event.suggestion,
    scorer: event.scorer,
    // ตรวจสุ่ม: status ยังเป็น "audit" อยู่ หรือเคยตัดสินในฐานะตรวจสุ่มแล้ว (กรณีแก้คำตัดสิน)
    audit: event.status === "audit" || event.audit === true,
    revision_of: event.review_id ?? null,
    created_at: now,
  }
}

export type KeyAction =
  | { type: "decide"; decision: Decision }
  | { type: "next" }
  | { type: "prev" }
  | { type: "note" }
  | { type: "close" }

const DECISION_KEYS: Record<string, Decision> = { "1": "real_loss", "2": "noise", "3": "legit", "4": "follow_up" }

/** ปุ่มลัดในคิว: 1–4 ตัดสิน · J/K ถัดไป/ก่อนหน้า · N โน้ต · Esc ปิด — ไม่ทำงานระหว่างพิมพ์ในช่องข้อความ */
export function keyAction(key: string, inTextField: boolean): KeyAction | null {
  if (inTextField) return null
  if (Object.hasOwn(DECISION_KEYS, key)) return { type: "decide", decision: DECISION_KEYS[key] }
  switch (key.toLowerCase()) {
    case "j":
      return { type: "next" }
    case "k":
      return { type: "prev" }
    case "n":
      return { type: "note" }
    case "escape":
      return { type: "close" }
    default:
      return null
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/lib/fuel-decision.test.mjs`
Expected: `ℹ pass 7` · `ℹ fail 0`.

- [ ] **Step 5: Gates and commit**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/lib/fuel-decision.ts
git add src/lib/fuel-decision.ts src/lib/fuel-decision.test.mjs
git commit -m "feat(fuel): decision validation, review document and keyboard map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Series shaping

**Files:**
- Create: `src/lib/__fixtures__/gps-series-sample.json` (generated with Part 1's Python codec)
- Create: `src/lib/fuel-series.ts`
- Test: `src/lib/fuel-series.test.mjs`

**Interfaces:**
- Consumes: `src/lib/series-codec.ts` types (`BinaryLike`, `FuelUnit`, `SeriesColumns`) — the runtime codec is passed in as `Codec`; Task 2 types.
- Produces: `SeriesDoc`, `Codec`, `SourceSeries`, `PARKED_KMH`, `statusOf(speed, engine)`, `buildSeries(docs, codec)`, `sliceWindow(series, fromMs, toMs)`, `levelAt(series, ts)`, `pointNear(seriesList, ts)`, `CoverageVerdict`, `coverageVerdict(days)`, `LastSeen`, `lastSeenOf(doc, codec)`, `coverageRows(docs)`.

- [ ] **Step 1: Generate the fixture with Part 1's codec**

Part 1's encoder is `scripts/fuel/series_codec.py` in api-ncac (worktree `~/Documents/project/ncac/api-ncac-fuel`, branch `feat/fuel-gps-series`; any api-ncac checkout that has the file works). `-B` keeps Python from writing `__pycache__` into that checkout.

```bash
cd ~/Documents/project/ncac/api-ncac-fuel && .venv/bin/python -B - <<'EOF'
import base64, json, os, sys
sys.path.insert(0, "scripts/fuel")
import numpy as np
from series_codec import encode_columns

def doc(plate, day, date_iso, source, unit, cols, status="ok"):
    n = len(cols["m"])
    last = f"{cols['m'][-1] // 60:02d}:{cols['m'][-1] % 60:02d}" if n else None
    out = {"plate": plate, "date_key": day, "date": date_iso, "source": source, "fuel_unit": unit,
           "tank_l": 200.0, "n": n, "coverage": {"status": status, "minutes": n, "last": last}}
    if n:
        packed = encode_columns({k: np.array(v) for k, v in cols.items()})
        out["cols"] = {k: base64.b64encode(v).decode() for k, v in packed.items()}
    return out

A = dict(m=[120, 121, 150, 151, 180, 181], fuel=[6000, 5990, 4400, 4380, 4380, -1],
         fuel_lo=[5980, 5980, 4390, 4370, 4370, -1], fuel_hi=[6010, 6000, 4410, 4390, 4390, -1],
         speed=[0] * 6, engine=[0] * 6, lat=[1379576] * 5 + [0], lng=[10055717] * 5 + [0])
B = dict(m=[130, 160], fuel=[1180, 880], fuel_lo=[1180, 880], fuel_hi=[1180, 880],
         speed=[0, 0], engine=[1, 0], lat=[1379580] * 2, lng=[10055720] * 2)
C = dict(m=[0, 1], fuel=[4370, 4365], fuel_lo=[4360, 4355], fuel_hi=[4380, 4375],
         speed=[12, 30], engine=[1, 1], lat=[1379600, 1379700], lng=[10055800, 10055900])
E = dict(m=[600, 601], fuel=[5000, 4990], fuel_lo=[4990, 4980], fuel_hi=[5010, 5000],
         speed=[0, 0], engine=[0, 0], lat=[1380000, 1380000], lng=[10060000, 10060000])
EMPTY = {k: [] for k in ("m", "fuel", "fuel_lo", "fuel_hi", "speed", "engine", "lat", "lng")}
docs = [
    doc("สบ.71-8635", "2026-10-05", "2026-10-04T17:00:00.000Z", "besttech", "cpct", A),
    doc("สบ.71-8635", "2026-10-05", "2026-10-04T17:00:00.000Z", "terminus", "dl", B),
    doc("สบ.71-8635", "2026-10-06", "2026-10-05T17:00:00.000Z", "besttech", "cpct", C),
    doc("สบ.71-8623", "2026-10-05", "2026-10-04T17:00:00.000Z", "besttech", "cpct", EMPTY, status="offline"),
    doc("สบ.71-8623", "2026-10-04", "2026-10-03T17:00:00.000Z", "besttech", "cpct", E),
]
path = os.path.expanduser("~/Documents/project/fuel-control-center/fcc-fuel/src/lib/__fixtures__/gps-series-sample.json")
with open(path, "w") as f:
    json.dump(docs, f, ensure_ascii=False, indent=1)
print("wrote", path)
EOF
cd ~/Documents/project/fuel-control-center/fcc-fuel
```
Expected: `wrote …/gps-series-sample.json`.

- [ ] **Step 2: Write the failing test**

`src/lib/fuel-series.test.mjs`:
```js
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { buildSeries, coverageRows, coverageVerdict, lastSeenOf, levelAt, pointNear, sliceWindow, statusOf } from "./fuel-series.ts"
import { decodeColumns, fuelToLitres, toDegrees } from "./series-codec.ts"

const docs = JSON.parse(readFileSync(new URL("./__fixtures__/gps-series-sample.json", import.meta.url), "utf8"))
const codec = { decodeColumns, fuelToLitres, toDegrees }
const utc = (d, h, mi) => Date.UTC(2026, 9, d, h, mi)
const r2 = (values) => values.map((v) => (v == null ? null : Math.round(v * 100) / 100))

test("status follows engine and speed", () => {
  assert.equal(statusOf(0, 0), "ดับเครื่อง")
  assert.equal(statusOf(3, 1), "จอดรถ")
  assert.equal(statusOf(40, 1), "รถวิ่ง")
})

test("builds one ordered series per source in litres", () => {
  const out = buildSeries([docs[2], docs[0], docs[3], docs[1]], codec)
  assert.equal(out.length, 2)
  const bt = out.find((s) => s.source === "besttech")
  const te = out.find((s) => s.source === "terminus")
  assert.deepEqual(bt.ts, [utc(4, 19, 0), utc(4, 19, 1), utc(4, 19, 30), utc(4, 19, 31), utc(4, 20, 0), utc(4, 20, 1), utc(5, 17, 0), utc(5, 17, 1)])
  assert.deepEqual(r2(bt.fuel), [120, 119.8, 88, 87.6, 87.6, null, 87.4, 87.3])
  assert.deepEqual(r2(bt.hi).slice(0, 2), [120.2, 120])
  assert.deepEqual([bt.status[0], bt.status[6], bt.status[7]], ["ดับเครื่อง", "รถวิ่ง", "รถวิ่ง"])
  assert.deepEqual(bt.lat.slice(4, 6), [13.79576, null])
  assert.deepEqual(r2(te.fuel), [118, 88])
  assert.deepEqual(te.status, ["จอดรถ", "ดับเครื่อง"])
})

test("slices a time window", () => {
  const [bt] = buildSeries([docs[0]], codec)
  const cut = sliceWindow(bt, utc(4, 19, 0), utc(4, 19, 31))
  assert.equal(cut.ts.length, 4)
  assert.deepEqual(r2(cut.fuel), [120, 119.8, 88, 87.6])
  assert.equal(cut.status.length, 4)
})

test("finds the nearest level and position", () => {
  const [bt, te] = buildSeries([docs[0], docs[1]], codec)
  assert.equal(Math.round(levelAt(bt, utc(4, 19, 10)) * 100) / 100, 119.8)
  assert.deepEqual(pointNear([bt, te], utc(4, 19, 12)), { lat: 13.7958, lng: 100.5572 })
  assert.equal(pointNear([], utc(4, 19, 12)), null)
})

test("coverage verdict prefers usable data and otherwise names the cause", () => {
  assert.deepEqual(coverageVerdict([]), { kind: "no_data", sources: [] })
  assert.deepEqual(coverageVerdict([{ source: "besttech", status: "offline" }]), { kind: "offline", sources: ["besttech"] })
  assert.deepEqual(
    coverageVerdict([{ source: "terminus", status: "no_sensor" }, { source: "besttech", status: "offline" }]),
    { kind: "no_sensor", sources: ["terminus"] },
  )
  assert.deepEqual(
    coverageVerdict([{ source: "terminus", status: "stuck" }, { source: "besttech", status: "ok" }]),
    { kind: "ok", sources: ["besttech"] },
  )
})

test("last seen is the newest minute with a position", () => {
  assert.deepEqual(lastSeenOf(docs[0], codec), { date_key: "2026-10-05", source: "besttech", time: "03:01", lat: 13.79576, lng: 100.55717 })
  assert.deepEqual(lastSeenOf(docs[3], codec), { date_key: "2026-10-05", source: "besttech", time: null, lat: null, lng: null })
})

test("coverage rows put problems first and fill missing fields", () => {
  const rows = coverageRows(docs.filter((d) => d.date_key === "2026-10-05"))
  assert.deepEqual(rows.map((r) => [r.plate, r.source, r.status]), [
    ["สบ.71-8623", "besttech", "offline"],
    ["สบ.71-8635", "besttech", "ok"],
    ["สบ.71-8635", "terminus", "ok"],
  ])
  assert.deepEqual(rows[0], {
    plate: "สบ.71-8623", source: "besttech", truck_code: null, status: "offline", minutes: 0,
    fuel_valid_share: 0, last: null, moved_km: 0, tank_l: 200, tank_from: "default",
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test src/lib/fuel-series.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND … src/lib/fuel-series.ts`.

- [ ] **Step 4: Implement `src/lib/fuel-series.ts`**

```ts
// gps_series (Part 1) → เส้นข้อมูลสำหรับกราฟ: ถอดคอลัมน์, แปลงเป็นลิตร, ต่อหลายวัน, ตัดช่วงเวลา, สถานะข้อมูล
// รันใต้ `node --test` ได้: ตัวถอดรหัส (series-codec) ถูกส่งเข้ามาเป็นอาร์กิวเมนต์ ไม่ import ตอนรัน

import type { BinaryLike, FuelUnit, SeriesColumns } from "./series-codec"
import type { CoverageRow, CoverageStatus, Source } from "./fuel-types"

/** analytics.gps_series หนึ่งเอกสาร = ทะเบียน × วัน × แหล่ง (spec §3.1); coverage.first / last เป็น "HH:MM" เวลาไทย */
export type SeriesDoc = {
  plate: string
  truck_code?: string | null
  date_key: string
  date: string | Date
  source: Source
  fuel_unit: FuelUnit
  tank_l: number
  tank_from?: string
  n: number
  cols?: Record<string, BinaryLike>
  coverage: {
    status: CoverageStatus
    minutes: number
    fuel_valid_share?: number
    first?: string | null
    last?: string | null
    moved_km?: number
  }
}

export type Codec = {
  decodeColumns: (cols: Record<string, BinaryLike>, n: number) => SeriesColumns
  fuelToLitres: (values: number[], unit: FuelUnit, tankL: number) => (number | null)[]
  toDegrees: (values: number[]) => (number | null)[]
}

export type SourceSeries = {
  source: Source
  tankL: number
  ts: number[]
  fuel: (number | null)[]
  lo: (number | null)[]
  hi: (number | null)[]
  speed: number[]
  engine: number[]
  status: string[]
  lat: (number | null)[]
  lng: (number | null)[]
}

export const PARKED_KMH = 5
const MINUTE_MS = 60_000

/** สถานะแบบเดียวกับแถบสีของกราฟเดิม */
export function statusOf(speed: number, engine: number): string {
  if (!engine) return "ดับเครื่อง"
  return speed > PARKED_KMH ? "รถวิ่ง" : "จอดรถ"
}

function emptySeries(source: Source, tankL: number): SourceSeries {
  return { source, tankL, ts: [], fuel: [], lo: [], hi: [], speed: [], engine: [], status: [], lat: [], lng: [] }
}

/** เอกสารหลายวัน/หลายแหล่ง (ลำดับใดก็ได้) → หนึ่งเส้นต่อแหล่ง เรียงตามเวลา; นาทีที่ไม่มีค่าน้ำมันเป็น null */
export function buildSeries(docs: SeriesDoc[], codec: Codec): SourceSeries[] {
  const bySource = new Map<Source, SourceSeries>()
  const usable = docs.filter((d) => d.n > 0 && d.cols).sort((a, b) => a.date_key.localeCompare(b.date_key))
  for (const doc of usable) {
    const cols = codec.decodeColumns(doc.cols as Record<string, BinaryLike>, doc.n)
    const dayStart = new Date(doc.date).getTime()
    const series = bySource.get(doc.source) ?? emptySeries(doc.source, doc.tank_l)
    bySource.set(doc.source, series)
    series.tankL = doc.tank_l
    const fuel = codec.fuelToLitres(cols.fuel, doc.fuel_unit, doc.tank_l)
    const lo = codec.fuelToLitres(cols.fuelLo, doc.fuel_unit, doc.tank_l)
    const hi = codec.fuelToLitres(cols.fuelHi, doc.fuel_unit, doc.tank_l)
    const lat = codec.toDegrees(cols.lat)
    const lng = codec.toDegrees(cols.lng)
    for (let i = 0; i < doc.n; i++) {
      series.ts.push(dayStart + cols.m[i] * MINUTE_MS)
      series.fuel.push(fuel[i])
      series.lo.push(lo[i])
      series.hi.push(hi[i])
      series.speed.push(cols.speed[i])
      series.engine.push(cols.engine[i])
      series.status.push(statusOf(cols.speed[i], cols.engine[i]))
      series.lat.push(lat[i])
      series.lng.push(lng[i])
    }
  }
  return [...bySource.values()]
}

/** เฉพาะนาทีในช่วง [fromMs, toMs] */
export function sliceWindow(series: SourceSeries, fromMs: number, toMs: number): SourceSeries {
  const keep: number[] = []
  series.ts.forEach((t, i) => {
    if (t >= fromMs && t <= toMs) keep.push(i)
  })
  const pick = <T>(values: T[]) => keep.map((i) => values[i])
  return {
    ...series,
    ts: pick(series.ts),
    fuel: pick(series.fuel),
    lo: pick(series.lo),
    hi: pick(series.hi),
    speed: pick(series.speed),
    engine: pick(series.engine),
    status: pick(series.status),
    lat: pick(series.lat),
    lng: pick(series.lng),
  }
}

/** ระดับน้ำมันของนาทีที่ใกล้ ts ที่สุด (ข้ามนาทีที่ไม่มีค่า) — ใช้ปักหมุดบนกราฟ */
export function levelAt(series: SourceSeries, ts: number): number {
  let best = 0
  let bestGap = Infinity
  series.ts.forEach((t, i) => {
    const value = series.fuel[i]
    if (value == null) return
    const gap = Math.abs(t - ts)
    if (gap < bestGap) {
      bestGap = gap
      best = value
    }
  })
  return best
}

/** พิกัดของนาทีที่ใกล้ ts ที่สุดจากทุกแหล่ง (ใช้เมื่อเหตุการณ์ไม่มี place) */
export function pointNear(seriesList: SourceSeries[], ts: number): { lat: number; lng: number } | null {
  let best: { lat: number; lng: number } | null = null
  let bestGap = Infinity
  for (const series of seriesList) {
    series.ts.forEach((t, i) => {
      const lat = series.lat[i]
      const lng = series.lng[i]
      if (lat == null || lng == null) return
      const gap = Math.abs(t - ts)
      if (gap < bestGap) {
        bestGap = gap
        best = { lat, lng }
      }
    })
  }
  return best
}

export type CoverageVerdict = { kind: CoverageStatus; sources: Source[] }
const VERDICT_ORDER: CoverageStatus[] = ["ok", "stuck", "no_sensor", "offline", "no_data"]

/** ok ถ้ามีวัน/แหล่งไหนข้อมูลน้ำมันใช้ได้ ไม่งั้นบอกสาเหตุ (เรียงจากดีสุดไปแย่สุด) */
export function coverageVerdict(days: { source: Source; status: CoverageStatus }[]): CoverageVerdict {
  for (const status of VERDICT_ORDER) {
    const hits = days.filter((d) => d.status === status)
    if (hits.length) return { kind: status, sources: [...new Set(hits.map((d) => d.source))] }
  }
  return { kind: "no_data", sources: [] }
}

export type LastSeen = { date_key: string; source: Source; time: string | null; lat: number | null; lng: number | null }

/** เอกสารล่าสุดที่ n > 0 → วัน, เวลา (coverage.last), ตำแหน่งสุดท้าย — แบนเนอร์ "ไม่มีข้อมูล" ใช้บอกว่าหายไปตั้งแต่เมื่อไรและที่ไหน */
export function lastSeenOf(doc: SeriesDoc, codec: Codec): LastSeen {
  const [series] = buildSeries([doc], codec)
  let lat: number | null = null
  let lng: number | null = null
  for (let i = (series?.ts.length ?? 0) - 1; i >= 0; i--) {
    if (series.lat[i] != null && series.lng[i] != null) {
      lat = series.lat[i]
      lng = series.lng[i]
      break
    }
  }
  return { date_key: doc.date_key, source: doc.source, time: doc.coverage.last ?? null, lat, lng }
}

const STATUS_RANK: Record<CoverageStatus, number> = { no_data: 0, offline: 1, no_sensor: 2, stuck: 3, ok: 4 }

/** ตารางสถานะข้อมูลรายคัน: ปัญหาขึ้นก่อน */
export function coverageRows(docs: SeriesDoc[]): CoverageRow[] {
  return docs
    .map((d) => ({
      plate: d.plate,
      source: d.source,
      truck_code: d.truck_code ?? null,
      status: d.coverage.status,
      minutes: d.coverage.minutes,
      fuel_valid_share: d.coverage.fuel_valid_share ?? 0,
      last: d.coverage.last ?? null,
      moved_km: d.coverage.moved_km ?? 0,
      tank_l: d.tank_l,
      tank_from: d.tank_from ?? "default",
    }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.plate.localeCompare(b.plate) || a.source.localeCompare(b.source))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test src/lib/fuel-series.test.mjs`
Expected: `ℹ pass 7` · `ℹ fail 0`.

- [ ] **Step 6: Gates and commit**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/lib/fuel-series.ts
git add src/lib/fuel-series.ts src/lib/fuel-series.test.mjs src/lib/__fixtures__/gps-series-sample.json
git commit -m "feat(fuel): gps_series shaping (litres, multi-day, windows, coverage verdict)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Report and settings logic

**Files:**
- Create: `src/lib/fuel-report.ts`, `src/lib/fuel-settings.ts`
- Test: `src/lib/fuel-report.test.mjs`, `src/lib/fuel-settings.test.mjs`

**Interfaces:**
- Consumes: Task 2 types.
- Produces: `ReportEvent`, `ReportRow`, `Report`, `UNKNOWN_DRIVER`, `UNKNOWN_PLANT`, `weekStart(dateKey)`, `buildReport(events, pricePerLitre | null)`, `confirmedRows(events, pricePerLitre | null)` (baht `null` while no price is set); `SETTINGS_ID = "default"`, `SettingsDoc`, `DEFAULT_SETTINGS` (price `null`, as Part 2), `withDefaults(doc)`, `validateSettings(body)`.

- [ ] **Step 1: Write the failing tests**

`src/lib/fuel-report.test.mjs`:
```js
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
```

`src/lib/fuel-settings.test.mjs`:
```js
import assert from "node:assert/strict"
import { test } from "node:test"

import { DEFAULT_SETTINGS, validateSettings, withDefaults } from "./fuel-settings.ts"

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/fuel-report.test.mjs src/lib/fuel-settings.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for both modules.

- [ ] **Step 3: Implement `src/lib/fuel-report.ts`**

```ts
// สรุปความเสียหายที่ยืนยันแล้ว + อัตราที่ทีมเห็นด้วยกับคำแนะนำ + ผลตรวจสุ่ม (spec §5.1 แท็บที่ 3)
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { FuelEvent } from "./fuel-types"

export type ReportEvent = Pick<FuelEvent, "plate" | "driver" | "plant" | "date_key" | "litres" | "decision" | "suggestion" | "audit">
export type ReportRow = { key: string; events: number; litres: number; baht: number | null }
export type Report = {
  confirmed: { events: number; litres: number; baht: number | null }
  byTruck: ReportRow[]
  byDriver: ReportRow[]
  byPlant: ReportRow[]
  byWeek: { week: string; events: number; litres: number }[]
  acceptance: { decided: number; agreed: number; rate: number | null }
  audit: { checked: number; realLoss: number; noise: number; legit: number; followUp: number }
}

export const UNKNOWN_DRIVER = "ไม่ทราบคนขับ"
export const UNKNOWN_PLANT = "ไม่ระบุแพลนท์"
const round1 = (n: number) => Math.round(n * 10) / 10
/** null = ยังไม่ได้ตั้งราคาน้ำมัน (รายงานแสดงแค่ลิตร) */
const toBaht = (litres: number, price: number | null) => (price == null ? null : Math.round(litres * price))

function groupLosses(losses: ReportEvent[], keyOf: (e: ReportEvent) => string, price: number | null): ReportRow[] {
  const rows = new Map<string, ReportRow>()
  for (const e of losses) {
    const key = keyOf(e)
    const row = rows.get(key) ?? { key, events: 0, litres: 0, baht: 0 }
    row.events += 1
    row.litres = round1(row.litres + e.litres)
    row.baht = toBaht(row.litres, price)
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.litres - a.litres || a.key.localeCompare(b.key))
}

/** วันจันทร์ของสัปดาห์ที่ date_key อยู่ */
export function weekStart(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function buildReport(events: ReportEvent[], pricePerLitre: number | null): Report {
  const losses = events.filter((e) => e.decision === "real_loss")
  const litres = round1(losses.reduce((sum, e) => sum + e.litres, 0))
  const weeks = new Map<string, { week: string; events: number; litres: number }>()
  for (const e of losses) {
    const week = weekStart(e.date_key)
    const row = weeks.get(week) ?? { week, events: 0, litres: 0 }
    row.events += 1
    row.litres = round1(row.litres + e.litres)
    weeks.set(week, row)
  }
  const judged = events.filter((e) => e.decision != null && e.decision !== "follow_up")
  const agreed = judged.filter((e) => e.decision === e.suggestion).length
  const audited = events.filter((e) => e.audit && e.decision != null)
  const count = (decision: string) => audited.filter((e) => e.decision === decision).length
  return {
    confirmed: { events: losses.length, litres, baht: toBaht(litres, pricePerLitre) },
    byTruck: groupLosses(losses, (e) => e.plate, pricePerLitre),
    byDriver: groupLosses(losses, (e) => e.driver || UNKNOWN_DRIVER, pricePerLitre),
    byPlant: groupLosses(losses, (e) => e.plant || UNKNOWN_PLANT, pricePerLitre),
    byWeek: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    acceptance: { decided: judged.length, agreed, rate: judged.length ? agreed / judged.length : null },
    audit: {
      checked: audited.length,
      realLoss: count("real_loss"),
      noise: count("noise"),
      legit: count("legit"),
      followUp: count("follow_up"),
    },
  }
}

/** แถวสำหรับ Excel: หนึ่งแถวต่อเหตุการณ์ที่ยืนยันว่าดูดจริง */
export function confirmedRows(events: ReportEvent[], pricePerLitre: number | null) {
  return events
    .filter((e) => e.decision === "real_loss")
    .sort((a, b) => a.date_key.localeCompare(b.date_key) || a.plate.localeCompare(b.plate))
    .map((e) => ({
      วันที่: e.date_key,
      ทะเบียน: e.plate,
      คนขับ: e.driver || UNKNOWN_DRIVER,
      แพลนท์: e.plant || UNKNOWN_PLANT,
      ลิตร: round1(e.litres),
      บาท: toBaht(e.litres, pricePerLitre),
    }))
}
```

- [ ] **Step 4: Implement `src/lib/fuel-settings.ts`**

```ts
// ค่าที่ทีมปรับได้ในแท็บสรุป (spec §4.6): ความมั่นใจขั้นต่ำที่ปิดอัตโนมัติ, สัดส่วนตรวจสุ่ม, ราคาน้ำมันต่อลิตร
// เอกสารเดียวใน analytics.fuel_settings (_id "default") — Part 2 อาจเก็บค่าอื่นในเอกสารเดียวกัน ห้ามเขียนทับ
// รันใต้ `node --test` ได้: TypeScript แบบ erasable เท่านั้น และ import ได้แค่ type

import type { FuelSettings } from "./fuel-types"

export const SETTINGS_ID = "default"
export type SettingsDoc = { _id: string; updated_at?: Date; updated_by?: string } & Partial<FuelSettings>

export const DEFAULT_SETTINGS: FuelSettings = { auto_close_conf: 0.95, audit_rate: 0.05, price_per_litre: null }

const KEYS = ["auto_close_conf", "audit_rate", "price_per_litre"] as const
const LIMITS: Record<keyof FuelSettings, [number, number]> = {
  auto_close_conf: [0.8, 0.999],
  audit_rate: [0, 0.5],
  price_per_litre: [1, 200],
}
const LABELS: Record<keyof FuelSettings, string> = {
  auto_close_conf: "ความมั่นใจขั้นต่ำที่ปิดอัตโนมัติ",
  audit_rate: "สัดส่วนตรวจสุ่ม",
  price_per_litre: "ราคาน้ำมันต่อลิตร",
}

export function withDefaults(doc: Record<string, unknown> | null | undefined): FuelSettings {
  const out = { ...DEFAULT_SETTINGS }
  for (const key of KEYS) {
    const value = doc?.[key]
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value
  }
  return out
}

export function validateSettings(body: unknown): { ok: true; value: FuelSettings } | { ok: false; error: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const value: FuelSettings = { ...DEFAULT_SETTINGS }
  for (const key of KEYS) {
    const raw = input[key]
    // ราคาเว้นว่างได้ = ยังไม่ตั้ง (รายงานแสดงแค่ลิตร)
    if (key === "price_per_litre" && (raw === null || raw === undefined || raw === "")) {
      value.price_per_litre = null
      continue
    }
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN
    const [min, max] = LIMITS[key]
    if (!Number.isFinite(n) || n < min || n > max) return { ok: false, error: `${LABELS[key]} ต้องอยู่ระหว่าง ${min}–${max}` }
    value[key] = n
  }
  return { ok: true, value }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test src/lib/fuel-report.test.mjs src/lib/fuel-settings.test.mjs`
Expected: `ℹ pass 7` · `ℹ fail 0`.

- [ ] **Step 6: Gates and commit**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/lib/fuel-report.ts src/lib/fuel-settings.ts
git add src/lib/fuel-report.ts src/lib/fuel-report.test.mjs src/lib/fuel-settings.ts src/lib/fuel-settings.test.mjs
git commit -m "feat(fuel): report aggregation and settings validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Read API routes

**Files:**
- Create: `src/lib/fuel-db.ts`, `src/lib/fuel-fixtures.ts`
- Create: `src/app/api/fuel/summary/route.ts`, `src/app/api/fuel/events/route.ts`, `src/app/api/fuel/events/[id]/route.ts`, `src/app/api/fuel/series/route.ts`, `src/app/api/fuel/coverage/route.ts`, `src/app/api/fuel/report/route.ts`, `src/app/api/fuel/settings/route.ts` (GET only — Task 7 adds PUT)

**Interfaces:**
- Consumes: Tasks 1–5 modules; `src/lib/series-codec.ts` (`decodeColumns`, `fuelToLitres`, `toDegrees`); `src/lib/mongodb.ts`.
- Produces (JSON, used by Tasks 9–12):
  - `GET /api/fuel/summary?date=` → `{ date, summary: DailySummary | null, checkFirst: FuelEvent[] }`
  - `GET /api/fuel/events?from&to&status&class&source&branch&fleet&plant&limit` → `{ filter: EventFilter, total, truncated, events: FuelEvent[] }` (ranked, without `features`)
  - `GET /api/fuel/events/[id]` → `{ event: FuelEvent, series: SourceSeries[] (±3 h), history: FuelEvent[] }`
  - `GET /api/fuel/series?plate&from&to&source` → `{ plate, from, to, series: SourceSeries[], days, verdict: CoverageVerdict, lastSeen: LastSeen | null, events: FuelEvent[] }`
  - `GET /api/fuel/coverage?date=` → `{ date, rows: CoverageRow[], counts: Record<status, number> }`
  - `GET /api/fuel/report?from&to` → `{ from, to, settings: FuelSettings, report: Report, rows: confirmed rows }`
  - `GET /api/fuel/settings` → `{ settings: FuelSettings, updated_at, updated_by, fixtures? }`
  - Errors: `{ error: "<ข้อความไทย>" }` with 400 / 404 / 500.

- [ ] **Step 1: Shared server helpers**

`src/lib/fuel-db.ts`:
```ts
import clientPromise from "@/lib/mongodb"

/** analytics DB (การเชื่อมต่อเดียวกับทั้งแอป) */
export async function analytics() {
  return (await clientPromise).db("analytics")
}

/** โหมดตัวอย่าง: FUEL_FIXTURES=1 ตอน dev ทำให้ /api/fuel/* อ่าน JSON แทน fuel_events / fuel_daily_summary — ไม่เขียนอะไรเลย */
export const fixturesOn = () => process.env.NODE_ENV !== "production" && process.env.FUEL_FIXTURES === "1"
```

`src/lib/fuel-fixtures.ts`:
```ts
import eventsJson from "./__fixtures__/fuel-events-sample.json"
import seriesJson from "./__fixtures__/gps-series-sample.json"
import summaryJson from "./__fixtures__/fuel-summary-sample.json"
import type { SeriesDoc } from "./fuel-series"
import type { DailySummary, FuelEvent } from "./fuel-types"

export const FIXTURE_EVENTS = eventsJson as unknown as FuelEvent[]
export const FIXTURE_SUMMARY = summaryJson as unknown as DailySummary
export const FIXTURE_SERIES = seriesJson as unknown as SeriesDoc[]
```

- [ ] **Step 2: Summary and events list**

`src/app/api/fuel/summary/route.ts`:
```ts
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS, FIXTURE_SUMMARY } from "@/lib/fuel-fixtures"
import type { DailySummary, FuelEventDoc } from "@/lib/fuel-types"
import { yesterdayKey } from "@/lib/thai-time"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || yesterdayKey(Date.now())
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "date ต้องเป็น YYYY-MM-DD" }, { status: 400 })
  try {
    if (fixturesOn()) {
      const summary = { ...FIXTURE_SUMMARY, _id: date }
      const checkFirst = summary.check_first.flatMap((id) => FIXTURE_EVENTS.filter((e) => e._id === id))
      return NextResponse.json({ date, summary, checkFirst })
    }
    const db = await analytics()
    const summary = await db.collection<DailySummary>("fuel_daily_summary").findOne({ _id: date })
    const ids = summary?.check_first ?? []
    const found = ids.length
      ? await db
          .collection<FuelEventDoc>("fuel_events")
          .find({ _id: { $in: ids } }, { projection: { features: 0 } })
          .toArray()
      : []
    const checkFirst = [...found].sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id))
    return NextResponse.json({ date, summary, checkFirst })
  } catch (err) {
    console.error("FUEL SUMMARY ERROR:", err)
    return NextResponse.json({ error: "โหลดสรุปไม่สำเร็จ" }, { status: 500 })
  }
}
```

`src/app/api/fuel/events/route.ts`:
```ts
import type { Filter } from "mongodb"
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { buildEventsQuery, matchesFilter, parseEventFilter, rankEvents } from "@/lib/fuel-events"
import { FIXTURE_EVENTS } from "@/lib/fuel-fixtures"
import type { FuelEventDoc } from "@/lib/fuel-types"
import { yesterdayKey } from "@/lib/thai-time"

// เดือนหนึ่งมีราว 1,000 เหตุการณ์ — ดึงมาเรียงในหน่วยความจำได้สบาย
const FETCH_CAP = 2000

export async function GET(request: Request) {
  const parsed = parseEventFilter(new URL(request.url).searchParams, yesterdayKey(Date.now()))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const filter = parsed.value
  try {
    if (fixturesOn()) {
      const ranked = rankEvents(FIXTURE_EVENTS.filter((e) => matchesFilter(e, filter)))
      return NextResponse.json({ filter, total: ranked.length, truncated: false, events: ranked.slice(0, filter.limit) })
    }
    const docs = await (await analytics())
      .collection<FuelEventDoc>("fuel_events")
      .find(buildEventsQuery(filter) as Filter<FuelEventDoc>, { projection: { features: 0 } })
      .limit(FETCH_CAP)
      .toArray()
    const ranked = rankEvents(docs)
    return NextResponse.json({
      filter,
      total: ranked.length,
      truncated: ranked.length >= FETCH_CAP,
      events: ranked.slice(0, filter.limit),
    })
  } catch (err) {
    console.error("FUEL EVENTS ERROR:", err)
    return NextResponse.json({ error: "โหลดเหตุการณ์ไม่สำเร็จ" }, { status: 500 })
  }
}
```

- [ ] **Step 3: Event detail**

`src/app/api/fuel/events/[id]/route.ts`:
```ts
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS, FIXTURE_SERIES } from "@/lib/fuel-fixtures"
import { buildSeries, sliceWindow, type SeriesDoc } from "@/lib/fuel-series"
import type { FuelEvent, FuelEventDoc } from "@/lib/fuel-types"
import { decodeColumns, fuelToLitres, toDegrees } from "@/lib/series-codec"
import { windowDateKeys } from "@/lib/thai-time"

const PAD_MS = 3 * 3_600_000
const HISTORY_DAYS = 30
const codec = { decodeColumns, fuelToLitres, toDegrees }

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    let event: FuelEvent | FuelEventDoc | null
    let docs: SeriesDoc[] = []
    let history: (FuelEvent | FuelEventDoc)[] = []
    if (fixturesOn()) {
      event = FIXTURE_EVENTS.find((e) => e._id === id) ?? null
      if (event) {
        const plate = event.plate
        docs = FIXTURE_SERIES.filter((d) => d.plate === plate)
        history = FIXTURE_EVENTS.filter((e) => e.plate === plate && e._id !== id)
      }
    } else {
      const db = await analytics()
      const events = db.collection<FuelEventDoc>("fuel_events")
      const found = await events.findOne({ _id: id })
      event = found
      if (found) {
        const keys = windowDateKeys(found.start.getTime(), found.end.getTime(), PAD_MS)
        docs = await db.collection<SeriesDoc>("gps_series").find({ plate: found.plate, date_key: { $in: keys } }).toArray()
        history = await events
          .find(
            { plate: found.plate, _id: { $ne: id }, start: { $gte: new Date(Date.now() - HISTORY_DAYS * 86_400_000) } },
            { projection: { features: 0 } },
          )
          .sort({ start: -1 })
          .limit(30)
          .toArray()
      }
    }
    if (!event) return NextResponse.json({ error: "ไม่พบเหตุการณ์นี้" }, { status: 404 })
    const startMs = new Date(event.start).getTime()
    const endMs = new Date(event.end).getTime()
    const series = buildSeries(docs, codec).map((s) => sliceWindow(s, startMs - PAD_MS, endMs + PAD_MS))
    return NextResponse.json({ event, series, history })
  } catch (err) {
    console.error("FUEL EVENT DETAIL ERROR:", err)
    return NextResponse.json({ error: "โหลดรายละเอียดเหตุการณ์ไม่สำเร็จ" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Truck series and data status**

`src/app/api/fuel/series/route.ts`:
```ts
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS, FIXTURE_SERIES } from "@/lib/fuel-fixtures"
import { buildSeries, coverageVerdict, lastSeenOf, type SeriesDoc } from "@/lib/fuel-series"
import type { FuelEvent, FuelEventDoc, Source } from "@/lib/fuel-types"
import { decodeColumns, fuelToLitres, toDegrees } from "@/lib/series-codec"
import { addDays, dateKeysBetween, yesterdayKey } from "@/lib/thai-time"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 14
const SOURCES: Source[] = ["besttech", "terminus"]
const codec = { decodeColumns, fuelToLitres, toDegrees }

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const plate = params.get("plate")?.trim() || ""
  const yesterday = yesterdayKey(Date.now())
  const to = params.get("to") || yesterday
  const from = params.get("from") || addDays(to, -2)
  const source = params.get("source") || null
  if (!plate) return NextResponse.json({ error: "ต้องระบุทะเบียน" }, { status: 400 })
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 })
  }
  if (dateKeysBetween(from, to).length > MAX_DAYS) {
    return NextResponse.json({ error: `เลือกได้ไม่เกิน ${MAX_DAYS} วัน` }, { status: 400 })
  }
  if (source && !SOURCES.includes(source as Source)) return NextResponse.json({ error: "แหล่ง GPS ไม่ถูกต้อง" }, { status: 400 })
  try {
    let docs: SeriesDoc[]
    let events: (FuelEvent | FuelEventDoc)[]
    // ถ้าช่วงนี้ไม่มีข้อมูลเลย: เอกสารล่าสุดที่มีข้อมูล เพื่อบอกว่าหายไปตั้งแต่เมื่อไร/ที่ไหน
    let latest: SeriesDoc | null = null
    const inRange = (d: { date_key: string }) => d.date_key >= from && d.date_key <= to
    if (fixturesOn()) {
      const own = FIXTURE_SERIES.filter((d) => d.plate === plate)
      docs = own.filter((d) => inRange(d) && (!source || d.source === source))
      events = FIXTURE_EVENTS.filter((e) => e.plate === plate && inRange(e))
      if (!docs.some((d) => d.n > 0)) {
        latest = own.filter((d) => d.n > 0).sort((a, b) => b.date_key.localeCompare(a.date_key))[0] ?? null
      }
    } else {
      const db = await analytics()
      const gps = db.collection<SeriesDoc>("gps_series")
      docs = await gps
        .find({ plate, date_key: { $gte: from, $lte: to }, ...(source ? { source: source as Source } : {}) })
        .toArray()
      events = await db
        .collection<FuelEventDoc>("fuel_events")
        .find({ plate, date_key: { $gte: from, $lte: to } }, { projection: { features: 0 } })
        .toArray()
      if (!docs.some((d) => d.n > 0)) latest = await gps.findOne({ plate, n: { $gt: 0 } }, { sort: { date_key: -1 } })
    }
    const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    return NextResponse.json({
      plate,
      from,
      to,
      series: buildSeries(docs, codec),
      days: docs.map((d) => ({ date_key: d.date_key, source: d.source, status: d.coverage.status, minutes: d.coverage.minutes })),
      verdict: coverageVerdict(docs.map((d) => ({ source: d.source, status: d.coverage.status }))),
      lastSeen: latest ? lastSeenOf(latest, codec) : null,
      events: sorted,
    })
  } catch (err) {
    console.error("FUEL SERIES ERROR:", err)
    return NextResponse.json({ error: "โหลดข้อมูล GPS ไม่สำเร็จ" }, { status: 500 })
  }
}
```

`src/app/api/fuel/coverage/route.ts`:
```ts
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_SERIES } from "@/lib/fuel-fixtures"
import { coverageRows, type SeriesDoc } from "@/lib/fuel-series"
import { yesterdayKey } from "@/lib/thai-time"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || yesterdayKey(Date.now())
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "date ต้องเป็น YYYY-MM-DD" }, { status: 400 })
  try {
    const docs: SeriesDoc[] = fixturesOn()
      ? FIXTURE_SERIES.filter((d) => d.date_key === date)
      : await (await analytics())
          .collection<SeriesDoc>("gps_series")
          .find({ date_key: date }, { projection: { cols: 0 } })
          .toArray()
    const rows = coverageRows(docs)
    const counts: Record<string, number> = {}
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1
    return NextResponse.json({ date, rows, counts })
  } catch (err) {
    console.error("FUEL COVERAGE ERROR:", err)
    return NextResponse.json({ error: "โหลดสถานะข้อมูลไม่สำเร็จ" }, { status: 500 })
  }
}
```

- [ ] **Step 5: Report and settings (read)**

`src/app/api/fuel/report/route.ts`:
```ts
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { FIXTURE_EVENTS } from "@/lib/fuel-fixtures"
import { buildReport, confirmedRows, type ReportEvent } from "@/lib/fuel-report"
import { DEFAULT_SETTINGS, SETTINGS_ID, withDefaults, type SettingsDoc } from "@/lib/fuel-settings"
import type { FuelEventDoc } from "@/lib/fuel-types"
import { addDays, dateKeysBetween, yesterdayKey } from "@/lib/thai-time"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 366

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const to = params.get("to") || yesterdayKey(Date.now())
  const from = params.get("from") || addDays(to, -29)
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 })
  }
  if (dateKeysBetween(from, to).length > MAX_DAYS) {
    return NextResponse.json({ error: `เลือกได้ไม่เกิน ${MAX_DAYS} วัน` }, { status: 400 })
  }
  try {
    let events: ReportEvent[]
    let settings = DEFAULT_SETTINGS
    if (fixturesOn()) {
      events = FIXTURE_EVENTS.filter((e) => e.date_key >= from && e.date_key <= to && e.decision != null)
    } else {
      const db = await analytics()
      const decided = await db
        .collection<FuelEventDoc>("fuel_events")
        .find(
          { date_key: { $gte: from, $lte: to }, decision: { $ne: null } },
          { projection: { plate: 1, driver: 1, plant: 1, date_key: 1, litres: 1, decision: 1, suggestion: 1, audit: 1 } },
        )
        .toArray()
      // ตรวจสุ่มดูจากรีวิวด้วย: งานกลางคืนรันซ้ำแล้ว ReplaceOne ทั้งเอกสาร ฟิลด์ audit บน event จึงหายได้
      const audited = new Set<unknown>(
        await db.collection("fuel_drop_reviews").distinct("event_id", { audit: true, event_id: { $in: decided.map((e) => e._id) } }),
      )
      events = decided.map((e) => ({ ...e, audit: e.audit === true || audited.has(e._id) }))
      settings = withDefaults(await db.collection<SettingsDoc>("fuel_settings").findOne({ _id: SETTINGS_ID }))
    }
    return NextResponse.json({
      from,
      to,
      settings,
      report: buildReport(events, settings.price_per_litre),
      rows: confirmedRows(events, settings.price_per_litre),
    })
  } catch (err) {
    console.error("FUEL REPORT ERROR:", err)
    return NextResponse.json({ error: "โหลดรายงานไม่สำเร็จ" }, { status: 500 })
  }
}
```

`src/app/api/fuel/settings/route.ts` (GET only for now):
```ts
import { NextResponse } from "next/server"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { DEFAULT_SETTINGS, SETTINGS_ID, withDefaults, type SettingsDoc } from "@/lib/fuel-settings"

export async function GET() {
  try {
    if (fixturesOn()) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS, updated_at: null, updated_by: null, fixtures: true })
    }
    const doc = await (await analytics()).collection<SettingsDoc>("fuel_settings").findOne({ _id: SETTINGS_ID })
    return NextResponse.json({ settings: withDefaults(doc), updated_at: doc?.updated_at ?? null, updated_by: doc?.updated_by ?? null })
  } catch (err) {
    console.error("FUEL SETTINGS GET ERROR:", err)
    return NextResponse.json({ error: "โหลดการตั้งค่าไม่สำเร็จ" }, { status: 500 })
  }
}
```

- [ ] **Step 6: Gates**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/lib/fuel-db.ts src/lib/fuel-fixtures.ts src/app/api/fuel
```
Expected: `ℹ fail 0`; `tsc-ok`; eslint prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/fuel-db.ts src/lib/fuel-fixtures.ts src/app/api/fuel
git commit -m "feat(fuel): read API — summary, events, event detail, truck series, coverage, report, settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Write API routes (decision, settings)

**Files:**
- Create: `src/app/api/fuel/events/[id]/decision/route.ts`
- Modify: `src/app/api/fuel/settings/route.ts` (add `PUT`; full file below)

**Interfaces:**
- Consumes: `validateDecision`, `buildReviewDoc` (Task 3); `validateSettings`, `withDefaults` (Task 5); `getServerSession` (next-auth), `authOptions` (`src/lib/auth.ts`).
- Produces: `POST /api/fuel/events/[id]/decision` body `{ decision, note }` → `{ ok: true, saved: true, review_id }` (fixture mode: `{ ok: true, saved: false, review }`), 400 with `{ error }`, 401 without session, 404 when the event is unknown or a nightly re-run replaced it (the review just inserted is removed again, so no orphan stays). `PUT /api/fuel/settings` body `{ auto_close_conf, audit_rate, price_per_litre }` → `{ ok: true, saved, settings }`, 400 / 401.

- [ ] **Step 1: Decision route**

`src/app/api/fuel/events/[id]/decision/route.ts`:
```ts
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { buildReviewDoc, validateDecision } from "@/lib/fuel-decision"
import { FIXTURE_EVENTS } from "@/lib/fuel-fixtures"
import type { FuelEventDoc } from "@/lib/fuel-types"

type Ctx = { params: Promise<{ id: string }> }

// งานกลางคืนรันซ้ำอาจแทนที่เหตุการณ์ที่ยังไม่ตัดสินด้วย _id ใหม่ (Part 2) — ให้ผู้ใช้โหลดรายการใหม่
const GONE = "ไม่พบเหตุการณ์นี้ (อาจถูกคำนวณใหม่) — โหลดรายการใหม่"

export async function POST(request: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions)
  const reviewer = session?.user?.email
  if (!reviewer) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนบันทึก" }, { status: 401 })

  const { id } = await ctx.params
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const checked = validateDecision(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  try {
    if (fixturesOn()) {
      const event = FIXTURE_EVENTS.find((e) => e._id === id)
      if (!event) return NextResponse.json({ error: GONE }, { status: 404 })
      const review = buildReviewDoc({ event, input: checked.value, reviewer, now: new Date() })
      return NextResponse.json({ ok: true, saved: false, review })
    }
    const db = await analytics()
    const events = db.collection<FuelEventDoc>("fuel_events")
    const reviews = db.collection("fuel_drop_reviews")
    const event = await events.findOne({ _id: id })
    if (!event) return NextResponse.json({ error: GONE }, { status: 404 })
    const now = new Date()
    const review = buildReviewDoc({ event, input: checked.value, reviewer, now })
    const { insertedId } = await reviews.insertOne(review)
    const { matchedCount } = await events.updateOne(
      { _id: id },
      {
        $set: {
          status: "decided",
          decision: checked.value.decision,
          review_id: insertedId,
          updated_at: now,
          ...(review.audit ? { audit: true } : {}),
        },
      },
    )
    if (!matchedCount) {
      // เหตุการณ์ถูกแทนที่ระหว่างนั้น — ไม่เก็บรีวิวที่ไม่มีเหตุการณ์
      await reviews.deleteOne({ _id: insertedId })
      return NextResponse.json({ error: GONE }, { status: 404 })
    }
    return NextResponse.json({ ok: true, saved: true, review_id: insertedId })
  } catch (err) {
    console.error("FUEL DECISION ERROR:", err)
    return NextResponse.json({ error: "บันทึกการตัดสินไม่สำเร็จ" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Settings with PUT**

Replace `src/app/api/fuel/settings/route.ts` with:
```ts
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { analytics, fixturesOn } from "@/lib/fuel-db"
import { DEFAULT_SETTINGS, SETTINGS_ID, validateSettings, withDefaults, type SettingsDoc } from "@/lib/fuel-settings"

export async function GET() {
  try {
    if (fixturesOn()) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS, updated_at: null, updated_by: null, fixtures: true })
    }
    const doc = await (await analytics()).collection<SettingsDoc>("fuel_settings").findOne({ _id: SETTINGS_ID })
    return NextResponse.json({ settings: withDefaults(doc), updated_at: doc?.updated_at ?? null, updated_by: doc?.updated_by ?? null })
  } catch (err) {
    console.error("FUEL SETTINGS GET ERROR:", err)
    return NextResponse.json({ error: "โหลดการตั้งค่าไม่สำเร็จ" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนบันทึก" }, { status: 401 })
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const checked = validateSettings(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  try {
    if (fixturesOn()) return NextResponse.json({ ok: true, saved: false, settings: checked.value })
    // $set เฉพาะสามค่านี้ — ค่าอื่นในเอกสารเดียวกันเป็นของ Part 2
    await (await analytics())
      .collection<SettingsDoc>("fuel_settings")
      .updateOne({ _id: SETTINGS_ID }, { $set: { ...checked.value, updated_at: new Date(), updated_by: email } }, { upsert: true })
    return NextResponse.json({ ok: true, saved: true, settings: checked.value })
  } catch (err) {
    console.error("FUEL SETTINGS PUT ERROR:", err)
    return NextResponse.json({ error: "บันทึกการตั้งค่าไม่สำเร็จ" }, { status: 500 })
  }
}
```

- [ ] **Step 3: Gates**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/app/api/fuel
```
Expected: `ℹ fail 0`; `tsc-ok`; eslint prints nothing. The 401 / 400 behaviour is checked with curl in Task 13.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/fuel/events/[id]/decision/route.ts src/app/api/fuel/settings/route.ts
git commit -m "feat(fuel): decision and settings write routes (session required)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Extend `FuelChart` for `gps_series`

**Files:**
- Modify: `src/components/fueldetection/graph/FuelChart.tsx` (full file below)

**Interfaces:**
- Consumes: `fuelOverlayPlugin`, `OVERLAY_COLORS`, `FuelOverlay` (unchanged); Thai helpers from `@/lib/fuel-analysis` (re-exported in Task 1).
- Produces: `FuelChart` props — `ts: number[]`, `smooth: (number | null)[]`, `raw?: (number | null)[]`, `lo?` / `hi?: (number | null)[]` (noise band), `speed: number[]`, `status: string[]`, `overlay`, `focus`, `onSelectIndex?`, `title?`, `subtitle?`, `smoothLabel?`, `height?` (default 480). The legacy page keeps passing `raw` + `smooth` + `onSelectIndex` and behaves as before.

- [ ] **Step 1: Replace `src/components/fueldetection/graph/FuelChart.tsx`**

```tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Tooltip,
  Decimation,
  type ChartData,
  type ChartOptions,
  type ChartEvent,
  type Scale,
  type TooltipItem,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"
import { fuelOverlayPlugin, OVERLAY_COLORS, type FuelOverlay } from "./fuelOverlayPlugin"
import { fmtThaiDateTime, fmtThaiDay, fmtThaiTime, nearestIndex, thaiMidnight } from "@/lib/fuel-analysis"

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Tooltip,
  Decimation,
  zoomPlugin,
  fuelOverlayPlugin
)

export type FocusRange = { min: number; max: number; key: number }

type Values = (number | null)[]

interface Props {
  ts: number[]
  /** เส้นหลัก (ลิตร) — null = ไม่มีค่า กราฟเว้นช่วง ไม่ใช่ศูนย์ */
  smooth: Values
  /** ค่าดิบรายจุด (หน้าเดิม) */
  raw?: Values
  /** ต่ำสุด/สูงสุดในแต่ละนาที (gps_series) → แถบสัญญาณรบกวน */
  lo?: Values
  hi?: Values
  speed: number[]
  status: string[]
  overlay: Omit<FuelOverlay, "ts" | "status">
  focus: FocusRange | null
  onSelectIndex?: (idx: number) => void
  title?: string
  subtitle?: string
  smoothLabel?: string
  height?: number
}

type Pt = { x: number; y: number | null }
type FuelChartJS = ChartJS<"line", Pt[]> & { $fuelOverlay?: FuelOverlay }

const MIN = 60_000
const HOUR = 60 * MIN
// ระยะห่างของ tick แกนเวลา — เลือกอันแรกที่ทำให้มี ≤ 12 tick
const TICK_STEPS = [15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR]

const toggleClass = (on: boolean) =>
  `h-9 rounded-[12px] border border-line-input px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-forest ${
    on ? "bg-mint text-forest-dark" : "bg-surface text-muted-ink"
  }`

const fmtL = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(1))

export function FuelChart({
  ts,
  smooth,
  raw,
  lo,
  hi,
  speed,
  status,
  overlay,
  focus,
  onSelectIndex,
  title = "กราฟระดับน้ำมันและความเร็ว",
  subtitle = "เลื่อนล้อเมาส์เพื่อซูม · ลากเพื่อเลื่อน · คลิก 2 จุดบนกราฟเพื่อเลือกช่วง",
  smoothLabel = "น้ำมัน (เฉลี่ย ตัดการกระฉอก)",
  height = 480,
}: Props) {
  const chartRef = useRef<FuelChartJS | null>(null)
  const [showRaw, setShowRaw] = useState(true)
  const [showBand, setShowBand] = useState(true)
  const [showSpeed, setShowSpeed] = useState(true)
  const hasRaw = raw != null
  const hasBand = lo != null && hi != null

  // ค่าที่ callback ของ Chart.js ต้องอ่าน — เก็บใน ref เพื่อให้ options คงที่ (options เปลี่ยน = zoom รีเซ็ต)
  const live = useRef({ ts, raw, smooth, lo, hi, speed, status, onSelectIndex })
  useEffect(() => {
    live.current = { ts, raw, smooth, lo, hi, speed, status, onSelectIndex }
  }, [ts, raw, smooth, lo, hi, speed, status, onSelectIndex])

  // ส่ง overlay ให้ plugin แล้ววาดใหม่ (ไม่ update options)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.$fuelOverlay = { ts, status, ...overlay }
    chart.draw()
  }, [ts, status, overlay])

  // ซูมไปยังช่วงที่เลือกจากรายการ
  useEffect(() => {
    if (!focus) return
    chartRef.current?.zoomScale("x", { min: focus.min, max: focus.max }, "none")
  }, [focus])

  const fuelMax = useMemo(() => {
    let m = 0
    for (const values of [hi, raw, smooth]) {
      if (!values) continue
      for (const v of values) if (v != null && v > m) m = v
    }
    return Math.ceil((m * 1.15) / 50) * 50 || 100
  }, [hi, raw, smooth])

  const chartData: ChartData<"line", Pt[]> = useMemo(() => {
    const datasets: ChartData<"line", Pt[]>["datasets"] = [
      {
        label: "น้ำมัน",
        data: ts.map((x, i) => ({ x, y: smooth[i] ?? null })),
        yAxisID: "y",
        borderColor: OVERLAY_COLORS.forest,
        backgroundColor: OVERLAY_COLORS.forest,
        borderWidth: 2.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0,
        spanGaps: false,
        order: 1,
      },
    ]
    if (raw) {
      datasets.push({
        label: "ค่าดิบ",
        data: ts.map((x, i) => ({ x, y: raw[i] ?? null })),
        yAxisID: "y",
        borderColor: "#9DB5A6",
        borderWidth: 1.1,
        pointRadius: 0,
        pointHoverRadius: 0,
        hidden: !showRaw,
        order: 2,
      })
    }
    datasets.push({
      label: "ความเร็ว",
      data: ts.map((x, i) => ({ x, y: speed[i] ?? null })),
      yAxisID: "y1",
      borderColor: "transparent",
      backgroundColor: "rgba(201,214,204,0.7)",
      fill: "origin",
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      stepped: true,
      hidden: !showSpeed,
      order: 3,
    })
    if (lo && hi) {
      // แถบระหว่างต่ำสุด-สูงสุดในนาที: dataset สูงสุดเติมสีลงไปถึง dataset ถัดไป (ต่ำสุด)
      datasets.push({
        label: "สูงสุดในนาที",
        data: ts.map((x, i) => ({ x, y: hi[i] ?? null })),
        yAxisID: "y",
        borderColor: "transparent",
        backgroundColor: "rgba(157,181,166,0.35)",
        fill: "+1",
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        hidden: !showBand,
        order: 4,
      })
      datasets.push({
        label: "ต่ำสุดในนาที",
        data: ts.map((x, i) => ({ x, y: lo[i] ?? null })),
        yAxisID: "y",
        borderColor: "transparent",
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        hidden: !showBand,
        order: 5,
      })
    }
    return { datasets }
  }, [ts, smooth, raw, lo, hi, speed, showRaw, showBand, showSpeed])

  // options คงที่ตลอดอายุ component — ข้อมูลที่เปลี่ยนอ่านผ่าน live ref / scale ที่คำนวณใหม่
  const chartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: { mode: "nearest", axis: "x", intersect: false },

      onClick: (event: ChartEvent) => {
        const chart = chartRef.current
        const select = live.current.onSelectIndex
        if (!chart || !select || event.x == null) return
        const a = chart.chartArea
        if (event.x < a.left || event.x > a.right) return
        const value = chart.scales.x.getValueForPixel(event.x)
        if (value == null) return
        const idx = nearestIndex(live.current.ts, value)
        if (idx >= 0) select(idx)
      },

      plugins: {
        legend: { display: false },
        decimation: { enabled: true, algorithm: "lttb", samples: 1500, threshold: 3000 },
        tooltip: {
          backgroundColor: "#FFFDF7",
          borderColor: "#E3DDCC",
          borderWidth: 1,
          titleColor: "#23302A",
          bodyColor: "#3E4D45",
          padding: 10,
          titleFont: { size: 13, weight: "bold" },
          bodyFont: { size: 12 },
          displayColors: false,
          filter: (item: TooltipItem<"line">) => item.datasetIndex === 0,
          callbacks: {
            title: (items: TooltipItem<"line">[]) => {
              const x = items[0]?.parsed.x
              return x == null ? "" : fmtThaiDateTime(x)
            },
            label: (item: TooltipItem<"line">) => {
              const d = live.current
              const i = nearestIndex(d.ts, item.parsed.x ?? 0)
              if (i < 0) return ""
              const fuel = d.smooth[i]
              const prev = i > 0 ? d.smooth[i - 1] : null
              const delta = fuel != null && prev != null ? fuel - prev : null
              const lines = [
                fuel == null
                  ? "น้ำมัน – (ไม่มีค่าในนาทีนี้)"
                  : `น้ำมัน ${fuel.toFixed(1)} ล.${delta == null ? "" : ` (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} จากจุดก่อน)`}`,
              ]
              const rawValue = d.raw?.[i]
              if (rawValue != null) lines.push(`ค่าดิบ ${rawValue.toFixed(1)} ล.`)
              const low = d.lo?.[i]
              const high = d.hi?.[i]
              if (low != null && high != null && high - low >= 0.1) lines.push(`ช่วงในนาที ${fmtL(low)}–${fmtL(high)} ล.`)
              lines.push(`ความเร็ว ${Math.round(d.speed[i] ?? 0)} กม./ชม. · ${d.status[i] || "ไม่ทราบสถานะ"}`)
              return lines
            },
          },
        },
        zoom: {
          zoom: { wheel: { enabled: true, speed: 0.1 }, pinch: { enabled: true }, drag: { enabled: false }, mode: "x" },
          pan: { enabled: true, mode: "x" },
          limits: { x: { min: "original", max: "original" } },
        },
      },

      scales: {
        x: {
          type: "linear",
          bounds: "data", // แกนเริ่ม/จบตรงกับข้อมูล ไม่ปัดเป็นเลขกลม
          grid: { display: false },
          // tick ตรงชั่วโมงเวลาไทย และขึ้นชื่อวันที่เที่ยงคืน
          afterBuildTicks: (scale: Scale) => {
            const range = scale.max - scale.min
            const step = TICK_STEPS.find((s) => range / s <= 12) ?? 24 * HOUR
            const first = thaiMidnight(scale.min) + Math.ceil((scale.min - thaiMidnight(scale.min)) / step) * step
            const ticks = []
            for (let v = first; v <= scale.max; v += step) ticks.push({ value: v })
            scale.ticks = ticks
          },
          ticks: {
            maxRotation: 0,
            autoSkip: false,
            color: "#5E6B63",
            font: { size: 11 },
            callback: (v) => {
              const n = Number(v)
              return n === thaiMidnight(n) ? fmtThaiDay(n) : fmtThaiTime(n)
            },
          },
        },
        y: {
          type: "linear",
          position: "left",
          min: 0,
          suggestedMax: fuelMax,
          title: { display: true, text: "ลิตร", color: "#5E6B63", font: { size: 12 } },
          ticks: { color: "#5E6B63" },
          grid: { color: "#EDE8DA" },
        },
        y1: {
          type: "linear",
          position: "right",
          min: 0,
          max: 300, // ความเร็วใช้แค่ ⅓ ล่างของกราฟ ไม่บังเส้นน้ำมัน
          title: { display: true, text: "กม./ชม.", color: "#5E6B63", font: { size: 11 } },
          ticks: { color: "#5E6B63", stepSize: 50, callback: (v) => (Number(v) <= 100 ? v : "") },
          grid: { drawOnChartArea: false },
        },
      },
    }),
    // fuelMax: เปลี่ยนเฉพาะตอนโหลดข้อมูลชุดใหม่ (ซึ่ง zoom ควรรีเซ็ตอยู่แล้ว)
    [fuelMax]
  )

  const legend = [
    { label: smoothLabel, swatch: "h-[3px] w-[18px] rounded bg-forest", show: true },
    { label: "ค่าดิบจากเซนเซอร์", swatch: "h-[2px] w-[18px] bg-[#9DB5A6]", show: hasRaw },
    { label: "ช่วงค่าดิบในแต่ละนาที", swatch: "h-2.5 w-3.5 rounded-sm bg-[#9DB5A6]/40", show: hasBand },
    { label: "ความเร็ว", swatch: "h-2.5 w-3.5 rounded-sm bg-[#C9D6CC]", show: true },
    { label: "จุดน่าสงสัยที่ระบบพบ", swatch: "h-3.5 w-3.5 rounded-full bg-clay", show: true },
    { label: "รถวิ่ง", swatch: "h-2 w-3.5 rounded-sm bg-forest", show: true },
    { label: "จอดรถ", swatch: "h-2 w-3.5 rounded-sm bg-butter", show: true },
    { label: "ดับเครื่อง", swatch: "h-2 w-3.5 rounded-sm bg-[#B9B3A3]", show: true },
    { label: "กลางคืน 18:00–06:00", swatch: "h-2 w-3.5 rounded-sm bg-ink/10", show: true },
  ].filter((l) => l.show)

  return (
    <section className="rounded-[22px] border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <p className="text-[13px] text-muted-ink">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasRaw && (
            <button type="button" aria-pressed={showRaw} onClick={() => setShowRaw((v) => !v)} className={toggleClass(showRaw)}>
              ค่าดิบจากเซนเซอร์
            </button>
          )}
          {hasBand && (
            <button type="button" aria-pressed={showBand} onClick={() => setShowBand((v) => !v)} className={toggleClass(showBand)}>
              ช่วงค่าดิบ
            </button>
          )}
          <button type="button" aria-pressed={showSpeed} onClick={() => setShowSpeed((v) => !v)} className={toggleClass(showSpeed)}>
            ความเร็ว
          </button>
          <button
            type="button"
            onClick={() => chartRef.current?.resetZoom("none")}
            className="h-9 rounded-[12px] border border-line-input bg-surface px-3 text-[13px] font-medium text-forest outline-none focus-visible:ring-2 focus-visible:ring-forest"
          >
            รีเซ็ตซูม
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-body">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={l.swatch} aria-hidden />
            {l.label}
          </span>
        ))}
      </div>

      <div style={{ height }}>
        <Chart
          ref={chartRef as never}
          type="line"
          data={chartData}
          options={chartOptions}
          aria-label={title}
        />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Gates**

```bash
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/components/fueldetection/graph/FuelChart.tsx
```
Expected: `ℹ fail 0`; `tsc-ok`; eslint prints nothing. (Legacy behaviour is checked in Task 13.)

- [ ] **Step 3: Commit**

```bash
git add src/components/fueldetection/graph/FuelChart.tsx
git commit -m "feat(fuel): FuelChart accepts gps_series (noise band, null gaps, optional raw/selection)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Shared UI pieces

**Files:**
- Create: `src/components/fuel/labels.ts`, `src/components/fuel/useJson.ts`, `src/components/fuel/SeriesChart.tsx`, `src/components/fuel/EventMap.tsx`, `src/components/fuel/EventMapLoader.tsx`, `src/components/fuel/NoDataBanner.tsx`

**Interfaces:**
- Consumes: Task 2 types; `StatusFilter` (Task 2); `SourceSeries`, `levelAt`, `CoverageVerdict` (Task 4); `FuelChart` (Task 8); `fmtDateKey` (Task 1).
- Produces: label maps `DECISION_LABEL`, `DECISION_HINT`, `CLASS_LABEL`, `CLASS_TONE`, `TONE_CLASS`, `SOURCE_LABEL`, `COVERAGE_LABEL`, `STATUS_FILTER_LABEL`; `useJson<T>(url | null) → { data, error, loading, reload }`; `<SeriesChart series events selectedId? height? title? subtitle? />`; `<EventMapLoader point />`; `<NoDataBanner verdict lastSeen />`.

- [ ] **Step 1: Labels and the fetch hook**

`src/components/fuel/labels.ts`:
```ts
import type { StatusFilter } from "@/lib/fuel-events"
import type { CoverageStatus, Decision, EventClass, Source } from "@/lib/fuel-types"

export const DECISION_LABEL: Record<Decision, string> = {
  real_loss: "ดูดจริง",
  noise: "สัญญาณรบกวน",
  legit: "ปกติ",
  follow_up: "ติดตาม",
}

export const DECISION_HINT: Record<Decision, string> = {
  real_loss: "ยืนยันว่าน้ำมันหายจริง (ต้องใส่โน้ต)",
  noise: "เซนเซอร์กระฉอก/กระโดด ไม่ได้หายจริง",
  legit: "เติม ใช้ตามปกติ หรือถ่ายเพื่อซ่อม",
  follow_up: "ยังสรุปไม่ได้ ต้องตามต่อ",
}

export const CLASS_LABEL: Record<EventClass, string> = {
  suspected_loss: "น่าจะดูดน้ำมันจริง",
  gap_loss: "น้ำมันหายช่วงสัญญาณขาด",
  noise: "สัญญาณรบกวน",
  consumption: "ใช้ตามปกติ",
  refuel: "เติมน้ำมัน",
  sensor_fault: "เซนเซอร์ผิดปกติ",
}

export type Tone = "clay" | "butter" | "muted" | "forest"
export const CLASS_TONE: Record<EventClass, Tone> = {
  suspected_loss: "clay",
  gap_loss: "clay",
  sensor_fault: "butter",
  noise: "muted",
  consumption: "muted",
  refuel: "forest",
}
export const TONE_CLASS: Record<Tone, string> = {
  clay: "bg-clay/10 text-clay",
  butter: "bg-butter/40 text-ink",
  muted: "bg-line text-muted-ink",
  forest: "bg-mint text-forest-dark",
}

export const SOURCE_LABEL: Record<Source, string> = { besttech: "Besttech", terminus: "Terminus" }

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  ok: "ปกติ",
  stuck: "ค่าน้ำมันค้าง",
  no_sensor: "ไม่มีเซนเซอร์น้ำมัน",
  offline: "กล่องออฟไลน์",
  no_data: "ไม่มีข้อมูล",
}

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  waiting: "รอตรวจ",
  decided: "ตัดสินแล้ว",
  auto_closed: "ปิดอัตโนมัติ",
  audit: "ตรวจสุ่ม",
  all: "ทั้งหมด",
}
```

`src/components/fuel/useJson.ts`:
```ts
"use client"

import { useCallback, useEffect, useState } from "react"

type State<T> = { key: string | null; data: T | null; error: string | null }

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
    return (body as { error: string }).error
  }
  return `โหลดข้อมูลไม่สำเร็จ (${status})`
}

/** GET JSON จาก /api — url เป็น null = ยังไม่โหลด; ระหว่างโหลดใหม่ยังเห็นข้อมูลชุดก่อน */
export function useJson<T>(url: string | null) {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<State<T>>({ key: null, data: null, error: null })
  const key = url ? `${url}#${tick}` : null

  useEffect(() => {
    if (!url || !key) return
    const controller = new AbortController()
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null)
        if (!res.ok) throw new Error(errorMessage(body, res.status))
        setState({ key, data: body as T, error: null })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState((prev) => ({ key, data: prev.data, error: err instanceof Error ? err.message : String(err) }))
      })
    return () => controller.abort()
  }, [url, key])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: key !== null && state.key !== key,
    reload,
  }
}
```

- [ ] **Step 2: Chart adapter, map and banner**

`src/components/fuel/SeriesChart.tsx`:
```tsx
"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import type { OverlayBand, OverlayMarker, OverlayRefuel } from "@/components/fueldetection/graph/fuelOverlayPlugin"
import { levelAt, type SourceSeries } from "@/lib/fuel-series"
import type { FuelEvent } from "@/lib/fuel-types"

// Chart.js ต้องมี window — โหลดเฉพาะฝั่ง client
const FuelChart = dynamic(() => import("@/components/fueldetection/graph/FuelChart").then((m) => m.FuelChart), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-[22px] bg-line" />,
})

type ChartEvent = Pick<FuelEvent, "_id" | "start" | "end" | "class" | "litres" | "decision">

type Props = {
  series: SourceSeries
  events: ChartEvent[]
  selectedId?: string | null
  height?: number
  title?: string
  subtitle?: string
}

const LOSS_CLASSES = new Set<string>(["suspected_loss", "gap_loss"])

/** เส้น gps_series หนึ่งแหล่ง + แถบ/หมุดของเหตุการณ์ บน FuelChart เดิม */
export function SeriesChart({ series, events, selectedId = null, height = 360, title, subtitle }: Props) {
  const overlay = useMemo(() => {
    const bands: OverlayBand[] = []
    const markers: OverlayMarker[] = []
    const refuels: OverlayRefuel[] = []
    events.forEach((e, i) => {
      const startTs = Date.parse(e.start)
      const endTs = Date.parse(e.end)
      const fuel = levelAt(series, (startTs + endTs) / 2)
      if (e.class === "refuel") {
        refuels.push({ ts: endTs, fuel, amount: e.litres })
        return
      }
      const cleared = e.decision === "noise" || e.decision === "legit" || !LOSS_CLASSES.has(e.class)
      const tone = cleared ? ("muted" as const) : ("clay" as const)
      const selected = e._id === selectedId
      bands.push({ startTs, endTs, tone, strength: selected ? 0.18 : 0.08 })
      markers.push({ n: i + 1, ts: (startTs + endTs) / 2, fuel, tone, selected })
    })
    return { bands, markers, refuels, selection: null }
  }, [series, events, selectedId])

  return (
    <FuelChart
      ts={series.ts}
      smooth={series.fuel}
      lo={series.lo}
      hi={series.hi}
      speed={series.speed}
      status={series.status}
      overlay={overlay}
      focus={null}
      title={title}
      subtitle={subtitle ?? "เส้นทึบ = ค่ากลางรายนาที · แถบจาง = ช่วงค่าดิบในนาที · เลื่อนล้อเมาส์เพื่อซูม"}
      smoothLabel="น้ำมัน (ค่ากลางรายนาที)"
      height={height}
    />
  )
}
```

`src/components/fuel/EventMap.tsx`:
```tsx
"use client"

import "leaflet/dist/leaflet.css"
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet"

export type MapPoint = { lat: number; lng: number }

/** จุดเกิดเหตุ — CircleMarker ไม่ต้องใช้ไฟล์ไอคอนของ Leaflet */
export default function EventMap({ point }: { point: MapPoint }) {
  return (
    <MapContainer center={[point.lat, point.lng]} zoom={15} scrollWheelZoom={false} className="h-full w-full rounded-[16px]">
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[point.lat, point.lng]}
        radius={9}
        pathOptions={{ color: "#B35A36", fillColor: "#B35A36", fillOpacity: 0.6 }}
      />
    </MapContainer>
  )
}
```

`src/components/fuel/EventMapLoader.tsx`:
```tsx
"use client"

import dynamic from "next/dynamic"
import type { MapPoint } from "./EventMap"

const EventMap = dynamic(() => import("./EventMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[16px] bg-line" />,
})

export function EventMapLoader({ point }: { point: MapPoint | null }) {
  if (!point) {
    return (
      <div className="flex h-full items-center justify-center rounded-[16px] bg-cream text-[13px] text-muted-ink">
        ไม่มีพิกัดของเหตุการณ์นี้
      </div>
    )
  }
  return <EventMap point={point} />
}
```

`src/components/fuel/NoDataBanner.tsx`:
```tsx
import type { CoverageVerdict, LastSeen } from "@/lib/fuel-series"
import type { CoverageStatus } from "@/lib/fuel-types"
import { fmtDateKey } from "@/lib/thai-time"
import { SOURCE_LABEL } from "./labels"

type Problem = Exclude<CoverageStatus, "ok">

const MESSAGE: Record<Problem, (who: string) => string> = {
  no_data: () => "ไม่มีข้อมูลจากผู้ให้บริการใดเลยในช่วงนี้",
  offline: (who) => `กล่อง ${who} ออฟไลน์ ไม่ส่งข้อมูลในช่วงที่เลือก`,
  no_sensor: (who) => `มีสัญญาณ GPS จาก ${who} แต่ไม่มีค่าน้ำมัน (ไม่มีเซนเซอร์น้ำมัน)`,
  stuck: (who) => `ค่าน้ำมันจาก ${who} ค้างค่าเดียวทั้งวันทั้งที่รถวิ่ง — เซนเซอร์น่าจะเสีย`,
}

type Props = { verdict: CoverageVerdict; lastSeen: LastSeen | null }

/** บอกเหตุผลเมื่อกราฟว่างหรือเชื่อไม่ได้ + ข้อมูลล่าสุดเมื่อไร/ที่ไหน (spec §5.1 รายคัน) */
export function NoDataBanner({ verdict, lastSeen }: Props) {
  if (verdict.kind === "ok") return null
  const who = verdict.sources.map((s) => SOURCE_LABEL[s]).join(" / ")
  const tone = verdict.kind === "stuck" ? "bg-butter/40 text-ink" : "bg-clay/10 text-clay"
  return (
    <div role="status" className={`rounded-[14px] px-4 py-3 text-[14px] ${tone}`}>
      <p>{MESSAGE[verdict.kind as Problem](who)}</p>
      {lastSeen && (
        <p className="mt-1 text-[13px]">
          ข้อมูลล่าสุดในระบบ: {fmtDateKey(lastSeen.date_key)}
          {lastSeen.time ? ` ${lastSeen.time}` : ""} ({SOURCE_LABEL[lastSeen.source]})
          {lastSeen.lat != null && lastSeen.lng != null && (
            <>
              {" · "}
              <a
                href={`https://www.google.com/maps?q=${lastSeen.lat},${lastSeen.lng}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                ตำแหน่งล่าสุด
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Gates and commit**

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/components/fuel
git add src/components/fuel
git commit -m "feat(fuel): shared UI — labels, fetch hook, series chart adapter, event map, no-data banner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected before the commit: `tsc-ok`; eslint prints nothing.

---

### Task 10: Queue tab

**Files:**
- Create: `src/components/fuel/MorningCard.tsx`, `src/components/fuel/EventFilters.tsx`, `src/components/fuel/EventCard.tsx`, `src/components/fuel/DecisionBar.tsx`, `src/components/fuel/EventPanel.tsx`, `src/components/fuel/QueueTab.tsx`

**Interfaces:**
- Consumes: `eventsUrl`, `eventPath`, `neighbourId`, `nextWaitingId`, `evidenceRows`, `STATUS_FILTERS`, `EVENT_CLASSES`, `SOURCES` (Task 2); `DECISIONS`, `NOTE_MIN_REAL_LOSS`, `keyAction` (Task 3); `pointNear` (Task 4); Task 6/7 routes; Task 9 pieces.
- Produces: `<QueueTab />` (reads `?from&to&status&class&source&event` once on mount).

- [ ] **Step 1: Morning card, filters, card**

`src/components/fuel/MorningCard.tsx`:
```tsx
import type { DailySummary, FuelEvent } from "@/lib/fuel-types"
import { fmtDateKey, fmtThaiTime } from "@/lib/thai-time"
import { CLASS_LABEL, SOURCE_LABEL } from "./labels"

type Props = {
  date: string | null
  summary: DailySummary | null
  checkFirst: FuelEvent[]
  loading: boolean
  onOpen: (id: string) => void
}

/** การ์ดเช้านี้ (spec §5.1) — ไม่แสดง ai_text */
export function MorningCard({ date, summary, checkFirst, loading, onOpen }: Props) {
  if (!date || (loading && !summary)) {
    return <section className="h-[132px] animate-pulse rounded-[22px] border border-line bg-surface" aria-busy />
  }
  if (!summary) {
    return (
      <section className="rounded-[22px] border border-line bg-surface p-5 text-[14px] text-muted-ink">
        ยังไม่มีสรุปของวันที่ {fmtDateKey(date)} — งานคำนวณกลางคืนอาจยังไม่เสร็จ
      </section>
    )
  }
  const noData = (summary.by_status.no_data ?? 0) + (summary.by_status.offline ?? 0)
  const stats: [string, string][] = [
    ["วิเคราะห์ได้", `${summary.trucks_analysed} คัน`],
    ["ไม่มีข้อมูล", `${noData} คัน`],
    ["พบเหตุการณ์", String(summary.events)],
    ["ปิดอัตโนมัติ", String(summary.auto_closed)],
    ["รอตรวจ", String(summary.open + summary.audit)],
    ["ลิตรที่น่าจะหาย", `~${Math.round(summary.likely_litres)} L`],
  ]
  return (
    <section className="rounded-[22px] border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold text-ink">เช้านี้ · {fmtDateKey(date)}</h2>
      {summary.sources_missing.length > 0 && (
        <p role="alert" className="mt-3 rounded-[12px] bg-clay/10 px-3 py-2 text-[14px] text-clay">
          ข้อมูลจาก {summary.sources_missing.map((s) => SOURCE_LABEL[s]).join(" / ")} ยังไม่เข้า — รถของผู้ให้บริการนี้ยังไม่ถูกวิเคราะห์
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-[14px] bg-cream px-3 py-2">
            <dt className="text-[12px] text-muted-ink">{label}</dt>
            <dd className="text-[18px] font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {checkFirst.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-muted-ink">ดูก่อน</h3>
          <ul className="mt-1 space-y-1">
            {checkFirst.map((e) => (
              <li key={e._id}>
                <button
                  type="button"
                  onClick={() => onOpen(e._id)}
                  className="text-left text-[14px] text-forest underline-offset-2 hover:underline"
                >
                  {e.plate} · {e.litres.toFixed(0)} L · {CLASS_LABEL[e.class]} · {fmtThaiTime(Date.parse(e.start))}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
```

`src/components/fuel/EventFilters.tsx`:
```tsx
"use client"

import { EVENT_CLASSES, SOURCES, STATUS_FILTERS, type StatusFilter } from "@/lib/fuel-events"
import type { EventClass, Source } from "@/lib/fuel-types"
import { CLASS_LABEL, SOURCE_LABEL, STATUS_FILTER_LABEL } from "./labels"

export type QueueFilters = {
  from: string
  to: string
  status: StatusFilter
  cls: EventClass | ""
  source: Source | ""
  branch: string
  fleet: string
  plant: string
}

const field = "mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"
const label = "text-[12px] text-muted-ink"

type Props = { value: QueueFilters; onChange: (next: QueueFilters) => void }

export function EventFilters({ value, onChange }: Props) {
  const set = <K extends keyof QueueFilters>(key: K, next: QueueFilters[K]) => onChange({ ...value, [key]: next })
  // ช่องข้อความใช้ค่าตอนออกจากช่อง/กด Enter — ไม่ยิง API ทุกตัวอักษร
  const textProps = (key: "branch" | "fleet" | "plant") => ({
    defaultValue: value[key],
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value.trim() !== value[key]) set(key, e.target.value.trim())
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur()
    },
    className: `${field} w-32`,
  })
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[22px] border border-line bg-surface p-4">
      <label className={label}>
        ตั้งแต่
        <input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} className={field} />
      </label>
      <label className={label}>
        ถึง
        <input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} className={field} />
      </label>
      <label className={label}>
        สถานะ
        <select value={value.status} onChange={(e) => set("status", e.target.value as StatusFilter)} className={field}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        ประเภท
        <select value={value.cls} onChange={(e) => set("cls", e.target.value as EventClass | "")} className={field}>
          <option value="">ทุกประเภท</option>
          {EVENT_CLASSES.map((c) => (
            <option key={c} value={c}>
              {CLASS_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        แหล่ง GPS
        <select value={value.source} onChange={(e) => set("source", e.target.value as Source | "")} className={field}>
          <option value="">ทุกแหล่ง</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        สาขา
        <input placeholder="เช่น ลาดกระบัง" {...textProps("branch")} />
      </label>
      <label className={label}>
        ฟลีท
        <input placeholder="เช่น Asia" {...textProps("fleet")} />
      </label>
      <label className={label}>
        แพลนท์
        <input placeholder="ชื่อแพลนท์" {...textProps("plant")} />
      </label>
    </div>
  )
}
```

`src/components/fuel/EventCard.tsx`:
```tsx
import type { FuelEvent } from "@/lib/fuel-types"
import { fmtThaiDateTime } from "@/lib/thai-time"
import { CLASS_LABEL, CLASS_TONE, DECISION_LABEL, TONE_CLASS } from "./labels"

type Props = { event: FuelEvent; selected: boolean; onSelect: () => void }

export function EventCard({ event, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-[18px] border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-forest ${
        selected ? "border-forest bg-mint/40" : "border-line bg-surface hover:bg-cream"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{event.plate}</span>
        <span className={`rounded-full px-2 py-0.5 text-[12px] ${TONE_CLASS[CLASS_TONE[event.class]]}`}>{CLASS_LABEL[event.class]}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-body">
        <span className="font-medium">{event.litres.toFixed(1)} L</span>
        <span>{Math.round(event.p_real_loss * 100)}%</span>
        <span>{fmtThaiDateTime(Date.parse(event.start))}</span>
        {event.driver && <span>{event.driver}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-ink">
        <span>
          แนะนำ: {DECISION_LABEL[event.suggestion]} · ความมั่นใจ {Math.round(event.confidence * 100)}%
        </span>
        {event.status === "audit" && <span className="rounded-full bg-butter/40 px-2 text-ink">ตรวจสุ่ม</span>}
        {event.decision && <span className="rounded-full bg-line px-2 text-ink">ตัดสิน: {DECISION_LABEL[event.decision]}</span>}
        {event.stale && <span className="rounded-full bg-line px-2 text-ink">รอบล่าสุดไม่พบแล้ว</span>}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Decision bar and event panel**

`src/components/fuel/DecisionBar.tsx`:
```tsx
"use client"

import type { RefObject } from "react"
import { DECISIONS, NOTE_MIN_REAL_LOSS } from "@/lib/fuel-decision"
import type { Decision, Suggestion } from "@/lib/fuel-types"
import { DECISION_HINT, DECISION_LABEL } from "./labels"

type Props = {
  suggestion: Suggestion
  current: Decision | null
  pendingLoss: boolean
  note: string
  saving: boolean
  error: string | null
  noteRef: RefObject<HTMLTextAreaElement | null>
  onChoose: (decision: Decision) => void
  onNoteChange: (note: string) => void
  onSaveLoss: () => void
}

/** ปุ่ม 4 แบบ: ปกติ/รบกวน/ติดตาม บันทึกทันที · ดูดจริงต้องใส่โน้ตก่อน (spec §5.1) */
export function DecisionBar({ suggestion, current, pendingLoss, note, saving, error, noteRef, onChoose, onNoteChange, onSaveLoss }: Props) {
  const lossReady = note.trim().length >= NOTE_MIN_REAL_LOSS
  return (
    <section aria-label="ตัดสินเหตุการณ์" className="rounded-[22px] border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d, i) => {
          const active = current === d || (d === "real_loss" && pendingLoss)
          const suggested = d === suggestion
          return (
            <button
              key={d}
              type="button"
              disabled={saving}
              onClick={() => onChoose(d)}
              title={DECISION_HINT[d]}
              className={`h-10 rounded-[12px] border px-3 text-[14px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-forest disabled:opacity-50 ${
                active ? "border-forest bg-forest text-cream" : "border-line-input bg-surface text-ink hover:bg-cream"
              } ${suggested ? "ring-2 ring-clay/60" : ""}`}
            >
              <span className="mr-1 text-[12px] opacity-70">{i + 1}</span>
              {DECISION_LABEL[d]}
              {suggested && <span className="ml-1 text-[11px]">· แนะนำ</span>}
            </button>
          )
        })}
      </div>
      <label htmlFor="fuel-decision-note" className="mt-3 block text-[13px] text-muted-ink">
        โน้ต {pendingLoss ? `(จำเป็น อย่างน้อย ${NOTE_MIN_REAL_LOSS} ตัวอักษร)` : "(ไม่บังคับ)"}
      </label>
      <textarea
        id="fuel-decision-note"
        ref={noteRef}
        value={note}
        rows={2}
        onChange={(e) => onNoteChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && pendingLoss && lossReady) {
            e.preventDefault()
            onSaveLoss()
          }
        }}
        placeholder="เช่น เทียบใบเติมแล้วไม่ตรง / โทรถามคนขับแล้ว"
        className="mt-1 w-full rounded-[12px] border border-line-input bg-surface p-2 text-[14px] text-ink"
      />
      {pendingLoss && (
        <button
          type="button"
          disabled={!lossReady || saving}
          onClick={onSaveLoss}
          className="mt-2 h-10 rounded-[12px] bg-clay px-4 text-[14px] font-semibold text-cream disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกว่าดูดจริง (Ctrl+Enter)"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-clay">
          {error}
        </p>
      )}
      <p className="mt-2 text-[12px] text-muted-ink">ปุ่มลัด: 1–4 ตัดสิน · J/K ถัดไป/ก่อนหน้า · N ไปที่โน้ต · Esc ปิด</p>
    </section>
  )
}
```

`src/components/fuel/EventPanel.tsx`:
```tsx
"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { eventPath, evidenceRows } from "@/lib/fuel-events"
import { pointNear, type SourceSeries } from "@/lib/fuel-series"
import type { FuelEvent, Source } from "@/lib/fuel-types"
import { fmtDateKey, fmtThaiDateTime, fmtThaiTime } from "@/lib/thai-time"
import { EventMapLoader } from "./EventMapLoader"
import { CLASS_LABEL, DECISION_LABEL, SOURCE_LABEL } from "./labels"
import { SeriesChart } from "./SeriesChart"
import { useJson } from "./useJson"

type Detail = { event: FuelEvent; series: SourceSeries[]; history: FuelEvent[] }
type Props = { eventId: string; onClose: () => void; children: ReactNode }

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section aria-label="รายละเอียดเหตุการณ์" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="h-9 shrink-0 rounded-[12px] border border-line-input bg-surface px-3 text-[13px] text-muted-ink"
        >
          ปิด (Esc)
        </button>
      </div>
      {children}
    </section>
  )
}

/** แผงรายละเอียด: กราฟ ±3 ชม., หลักฐาน, แผนที่, ประวัติ 30 วัน, ปุ่มตัดสิน (children) */
export function EventPanel({ eventId, onClose, children }: Props) {
  const { data, error } = useJson<Detail>(eventPath(eventId))
  const [source, setSource] = useState<Source | null>(null)

  if (error) {
    return (
      <PanelShell title="เหตุการณ์" onClose={onClose}>
        <p role="alert" className="text-[14px] text-clay">
          {error}
        </p>
      </PanelShell>
    )
  }
  if (!data) {
    return (
      <PanelShell title="กำลังโหลด…" onClose={onClose}>
        <div className="h-[320px] animate-pulse rounded-[22px] bg-line" />
      </PanelShell>
    )
  }

  const { event, series, history } = data
  const shown = series.find((s) => s.source === (source ?? event.sources[0])) ?? series[0] ?? null
  const startMs = Date.parse(event.start)
  const point =
    event.place?.lat != null && event.place?.lng != null
      ? { lat: event.place.lat, lng: event.place.lng }
      : pointNear(series, startMs)
  const code = event.truck_code && event.truck_code !== event.plate ? ` (${event.truck_code})` : ""

  return (
    <PanelShell title={`${event.plate}${code} · ${CLASS_LABEL[event.class]}`} onClose={onClose}>
      <p className="text-[14px] text-body">
        {fmtThaiDateTime(startMs)} – {fmtThaiTime(Date.parse(event.end))} · {event.litres.toFixed(1)} L
        {event.driver ? ` · คนขับ ${event.driver}` : " · ไม่ทราบคนขับ"} · จาก {event.sources.map((s) => SOURCE_LABEL[s]).join(" + ")}
      </p>

      {series.length > 1 && (
        <div className="flex gap-2" role="group" aria-label="เลือกแหล่ง GPS">
          {series.map((s) => (
            <button
              key={s.source}
              type="button"
              aria-pressed={shown?.source === s.source}
              onClick={() => setSource(s.source)}
              className={`h-9 rounded-[12px] border border-line-input px-3 text-[13px] ${
                shown?.source === s.source ? "bg-mint text-forest-dark" : "bg-surface text-muted-ink"
              }`}
            >
              {SOURCE_LABEL[s.source]}
            </button>
          ))}
        </div>
      )}

      {shown ? (
        <SeriesChart series={shown} events={[event]} selectedId={event._id} height={320} title="ระดับน้ำมันรอบเหตุการณ์ (±3 ชม.)" />
      ) : (
        <p className="rounded-[18px] border border-line bg-surface p-4 text-[14px] text-muted-ink">ไม่มีข้อมูล GPS ช่วงนี้</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
          <h3 className="text-[14px] font-semibold text-ink">หลักฐาน</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            {evidenceRows(event).map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-ink">{row.label}</dt>
                <dd className="text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
          {event.reasons.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-body">
              {event.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {event.action && <p className="rounded-[12px] bg-butter/40 px-3 py-2 text-[13px] text-ink">แนะนำให้: {event.action}</p>}
        </div>
        <div className="h-64 md:h-auto md:min-h-64">
          <EventMapLoader point={point} />
        </div>
      </div>

      {children}

      <div className="rounded-[22px] border border-line bg-surface p-4">
        <h3 className="text-[14px] font-semibold text-ink">เหตุการณ์อื่นของคันนี้ (30 วัน)</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted-ink">ไม่มีเหตุการณ์อื่น</p>
        ) : (
          <ul className="mt-1 space-y-1 text-[13px] text-body">
            {history.map((h) => (
              <li key={h._id}>
                {fmtDateKey(h.date_key)} {fmtThaiTime(Date.parse(h.start))} · {CLASS_LABEL[h.class]} · {h.litres.toFixed(1)} L
                {h.decision ? ` · ${DECISION_LABEL[h.decision]}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  )
}
```

- [ ] **Step 3: Queue tab**

`src/components/fuel/QueueTab.tsx`:
```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { keyAction } from "@/lib/fuel-decision"
import { eventPath, eventsUrl, neighbourId, nextWaitingId, type StatusFilter } from "@/lib/fuel-events"
import type { DailySummary, Decision, EventClass, FuelEvent, Source } from "@/lib/fuel-types"
import { DecisionBar } from "./DecisionBar"
import { EventCard } from "./EventCard"
import { EventFilters, type QueueFilters } from "./EventFilters"
import { EventPanel } from "./EventPanel"
import { MorningCard } from "./MorningCard"
import { useJson } from "./useJson"

type SummaryResponse = { date: string; summary: DailySummary | null; checkFirst: FuelEvent[] }
type EventsResponse = { filter: { from: string; to: string }; total: number; truncated: boolean; events: FuelEvent[] }

/** null = บันทึกแล้ว; ไม่งั้นคืนรหัส HTTP + ข้อความ */
async function postDecision(id: string, decision: Decision, note: string): Promise<{ status: number; error: string } | null> {
  try {
    const res = await fetch(`${eventPath(id)}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    })
    if (res.ok) return null
    if (res.status === 401) return { status: 401, error: "ต้องเข้าสู่ระบบใหม่ก่อนบันทึก" }
    const body: unknown = await res.json().catch(() => null)
    const error =
      body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `บันทึกไม่สำเร็จ (${res.status})`
    return { status: res.status, error }
  } catch {
    return { status: 0, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองอีกครั้ง" }
  }
}

export function QueueTab() {
  const params = useSearchParams()
  const [filters, setFilters] = useState<QueueFilters>(() => ({
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    status: (params.get("status") as StatusFilter | null) ?? "waiting",
    cls: (params.get("class") as EventClass | null) ?? "",
    source: (params.get("source") as Source | null) ?? "",
    branch: "",
    fleet: "",
    plant: "",
  }))
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("event"))
  const [decided, setDecided] = useState<Record<string, Decision>>({})
  const [note, setNote] = useState("")
  const [pendingLoss, setPendingLoss] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const summary = useJson<SummaryResponse>(filters.to ? `/api/fuel/summary?date=${filters.to}` : "/api/fuel/summary")
  const list = useJson<EventsResponse>(
    eventsUrl({
      from: filters.from,
      to: filters.to,
      status: filters.status,
      class: filters.cls,
      source: filters.source,
      branch: filters.branch,
      fleet: filters.fleet,
      plant: filters.plant,
    }),
  )

  // ผลการตัดสินที่เพิ่งบันทึก ทับบนรายการ (ไม่ต้องรอโหลดใหม่)
  const events = (list.data?.events ?? []).map((e) =>
    decided[e._id] ? { ...e, status: "decided" as const, decision: decided[e._id] } : e,
  )
  const ids = events.map((e) => e._id)
  const selected = events.find((e) => e._id === selectedId) ?? null
  const shownFilters: QueueFilters = {
    ...filters,
    from: filters.from || list.data?.filter.from || "",
    to: filters.to || list.data?.filter.to || "",
  }

  function select(id: string | null) {
    setSelectedId(id)
    setNote("")
    setPendingLoss(false)
    setError(null)
  }

  async function save(decision: Decision) {
    if (!selected || saving) return
    setSaving(true)
    setError(null)
    const failed = await postDecision(selected._id, decision, note)
    setSaving(false)
    if (failed) {
      setError(failed.error)
      if (failed.status === 404) list.reload() // งานกลางคืนแทนที่เหตุการณ์แล้ว
      return
    }
    const updated = events.map((e) => (e._id === selected._id ? { ...e, status: "decided" as const, decision } : e))
    setDecided((prev) => ({ ...prev, [selected._id]: decision }))
    select(nextWaitingId(updated, selected._id))
  }

  function choose(decision: Decision) {
    if (decision === "real_loss") {
      setPendingLoss(true)
      noteRef.current?.focus()
      return
    }
    void save(decision)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const inText = !!target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      const action = keyAction(e.key, inText)
      if (!action) return
      e.preventDefault()
      if (action.type === "next" || action.type === "prev") select(neighbourId(ids, selectedId, action.type === "next" ? 1 : -1))
      else if (action.type === "close") select(null)
      else if (!selectedId) return
      else if (action.type === "note") noteRef.current?.focus()
      else choose(action.decision)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="space-y-4">
      <MorningCard
        date={summary.data?.date ?? null}
        summary={summary.data?.summary ?? null}
        checkFirst={summary.data?.checkFirst ?? []}
        loading={summary.loading}
        onOpen={select}
      />
      {summary.error && (
        <p role="alert" className="text-[14px] text-clay">
          {summary.error}
        </p>
      )}
      <EventFilters
        value={shownFilters}
        onChange={(next) => {
          setFilters(next)
          select(null)
        }}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
        <section aria-label="คิวเหตุการณ์" className="space-y-2">
          <p className="text-[13px] text-muted-ink">
            {list.loading
              ? "กำลังโหลด…"
              : `${events.length} เหตุการณ์ เรียงตามลิตรที่น่าจะหาย${list.data?.truncated ? " (แสดงบางส่วน — ลดช่วงวันที่)" : ""}`}
          </p>
          {list.error && (
            <p role="alert" className="text-[14px] text-clay">
              {list.error}
            </p>
          )}
          {!list.loading && !list.error && events.length === 0 && (
            <p className="rounded-[18px] border border-line bg-surface p-4 text-[14px] text-muted-ink">ไม่มีเหตุการณ์ตามตัวกรองนี้</p>
          )}
          {events.map((e) => (
            <EventCard key={e._id} event={e} selected={e._id === selectedId} onSelect={() => select(e._id)} />
          ))}
        </section>
        {selected ? (
          <div className="fixed inset-0 z-40 overflow-y-auto bg-cream p-4 lg:static lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0">
            <EventPanel key={selected._id} eventId={selected._id} onClose={() => select(null)}>
              <DecisionBar
                suggestion={selected.suggestion}
                current={selected.decision}
                pendingLoss={pendingLoss}
                note={note}
                saving={saving}
                error={error}
                noteRef={noteRef}
                onChoose={choose}
                onNoteChange={setNote}
                onSaveLoss={() => void save("real_loss")}
              />
            </EventPanel>
          </div>
        ) : (
          <p className="hidden rounded-[22px] border border-dashed border-line p-8 text-center text-[14px] text-muted-ink lg:block">
            เลือกเหตุการณ์ทางซ้าย หรือกด J เพื่อเริ่ม
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Gates and commit**

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/components/fuel
git add src/components/fuel/MorningCard.tsx src/components/fuel/EventFilters.tsx src/components/fuel/EventCard.tsx src/components/fuel/DecisionBar.tsx src/components/fuel/EventPanel.tsx src/components/fuel/QueueTab.tsx
git commit -m "feat(fuel): queue tab — morning card, filters, ranked cards, event panel, one-click decisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected before the commit: `tsc-ok`; eslint prints nothing.

---

### Task 11: Truck tab

**Files:**
- Create: `src/components/fuel/TruckTab.tsx`

**Interfaces:**
- Consumes: `GET /api/fuel/series`, `GET /api/fuel/coverage` (Task 6); `SeriesChart`, `NoDataBanner`, `useJson`, labels (Task 9).
- Produces: `<TruckTab />` (reads `?plate&from&to` once on mount; clicking an event opens it in the queue tab).

- [ ] **Step 1: Implement `src/components/fuel/TruckTab.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { CoverageVerdict, LastSeen, SourceSeries } from "@/lib/fuel-series"
import type { CoverageRow, FuelEvent, Source } from "@/lib/fuel-types"
import { fmtThaiDateTime } from "@/lib/thai-time"
import { CLASS_LABEL, DECISION_LABEL, SOURCE_LABEL } from "./labels"
import { NoDataBanner } from "./NoDataBanner"
import { SeriesChart } from "./SeriesChart"
import { useJson } from "./useJson"

type SeriesResponse = {
  plate: string
  from: string
  to: string
  series: SourceSeries[]
  verdict: CoverageVerdict
  lastSeen: LastSeen | null
  events: FuelEvent[]
}
type CoverageResponse = { date: string; rows: CoverageRow[] }

const field = "mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"
const label = "text-[12px] text-muted-ink"

/** รายคัน: กราฟ gps_series ของทุกแหล่งในช่วงที่เลือก + เหตุผลเมื่อไม่มีข้อมูล (spec §5.1) */
export function TruckTab() {
  const params = useSearchParams()
  const router = useRouter()
  const [plate, setPlate] = useState(() => params.get("plate")?.trim() ?? "")
  const [draft, setDraft] = useState(plate)
  const [from, setFrom] = useState(() => params.get("from") ?? "")
  const [to, setTo] = useState(() => params.get("to") ?? "")
  const [source, setSource] = useState<Source | "">("")

  const coverage = useJson<CoverageResponse>("/api/fuel/coverage")
  const query = new URLSearchParams({ plate })
  if (from) query.set("from", from)
  if (to) query.set("to", to)
  const data = useJson<SeriesResponse>(plate ? `/api/fuel/series?${query.toString()}` : null)

  const plates = [...new Set((coverage.data?.rows ?? []).map((r) => r.plate))].sort((a, b) => a.localeCompare(b))
  const series = (data.data?.series ?? []).filter((s) => !source || s.source === source)
  const shownFrom = from || data.data?.from || ""
  const shownTo = to || data.data?.to || ""

  function openInQueue(e: FuelEvent) {
    const qs = new URLSearchParams({ tab: "queue", event: e._id, from: e.date_key, to: e.date_key, status: "all" })
    router.push(`/fueldetection?${qs.toString()}`)
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-[22px] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault()
          setPlate(draft.trim())
        }}
      >
        <label className={label}>
          ทะเบียน
          <input
            list="fuel-plates"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="เช่น สบ.71-8635"
            className={`${field} w-44`}
          />
          <datalist id="fuel-plates">
            {plates.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          ตั้งแต่
          <input type="date" value={shownFrom} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className={label}>
          ถึง
          <input type="date" value={shownTo} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
        <label className={label}>
          แหล่ง GPS
          <select value={source} onChange={(e) => setSource(e.target.value as Source | "")} className={field}>
            <option value="">ทุกแหล่ง</option>
            <option value="besttech">{SOURCE_LABEL.besttech}</option>
            <option value="terminus">{SOURCE_LABEL.terminus}</option>
          </select>
        </label>
        <button type="submit" className="h-9 rounded-[12px] bg-forest px-4 text-[13px] font-semibold text-cream">
          ดูกราฟ
        </button>
      </form>

      {!plate && <p className="text-[14px] text-muted-ink">เลือกหรือพิมพ์ทะเบียนเพื่อดูกราฟ (ช่วงเริ่มต้น 3 วันล่าสุด)</p>}
      {data.error && (
        <p role="alert" className="text-[14px] text-clay">
          {data.error}
        </p>
      )}
      {data.loading && <div className="h-[420px] animate-pulse rounded-[22px] bg-line" />}
      {data.data && !data.loading && (
        <>
          <NoDataBanner verdict={data.data.verdict} lastSeen={data.data.lastSeen} />
          {series.map((s) => (
            <SeriesChart key={s.source} series={s} events={data.data?.events ?? []} height={440} title={`${data.data?.plate} · ${SOURCE_LABEL[s.source]}`} />
          ))}
          <section className="rounded-[22px] border border-line bg-surface p-4">
            <h3 className="text-[14px] font-semibold text-ink">เหตุการณ์ในช่วงนี้</h3>
            {data.data.events.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted-ink">ไม่มีเหตุการณ์</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {data.data.events.map((e) => (
                  <li key={e._id}>
                    <button type="button" onClick={() => openInQueue(e)} className="text-left text-[13px] text-forest underline-offset-2 hover:underline">
                      {fmtThaiDateTime(Date.parse(e.start))} · {CLASS_LABEL[e.class]} · {e.litres.toFixed(1)} L
                      {e.decision ? ` · ${DECISION_LABEL[e.decision]}` : " · รอตรวจ"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Gates and commit**

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/components/fuel/TruckTab.tsx
git add src/components/fuel/TruckTab.tsx
git commit -m "feat(fuel): truck tab — gps_series charts for both vendors with no-data reasons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Report & data status tab

**Files:**
- Create: `src/components/fuel/ReportTab.tsx`, `src/components/fuel/DataStatusTable.tsx`, `src/components/fuel/SettingsForm.tsx`

**Interfaces:**
- Consumes: `GET /api/fuel/report`, `GET /api/fuel/coverage`, `GET|PUT /api/fuel/settings` (Tasks 6–7); `Report` (Task 5); `exportToExcel(rows, filename)` (`src/lib/exportToExcel.ts`); labels, `useJson` (Task 9).
- Produces: `<ReportTab />`.

- [ ] **Step 1: Data status table and settings form**

`src/components/fuel/DataStatusTable.tsx`:
```tsx
"use client"

import { useState } from "react"
import type { CoverageRow, CoverageStatus } from "@/lib/fuel-types"
import { COVERAGE_LABEL, SOURCE_LABEL } from "./labels"

type Props = { date: string; rows: CoverageRow[]; loading: boolean; onDateChange: (date: string) => void }

const STATUSES: CoverageStatus[] = ["no_data", "offline", "no_sensor", "stuck", "ok"]

/** สถานะข้อมูลรายคัน: แหล่ง, ข้อมูลล่าสุด, สถานะ, ขนาดถังและที่มา */
export function DataStatusTable({ date, rows, loading, onDateChange }: Props) {
  const [status, setStatus] = useState<CoverageStatus | "">("")
  const counts = STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length] as const)
  const shown = status ? rows.filter((r) => r.status === status) : rows
  return (
    <section className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">สถานะข้อมูล GPS รายคัน</h3>
        <label className="text-[12px] text-muted-ink">
          วันที่
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามสถานะ">
        <button type="button" aria-pressed={status === ""} onClick={() => setStatus("")} className="h-8 rounded-full border border-line-input px-3 text-[12px]">
          ทั้งหมด {rows.length}
        </button>
        {counts.map(([s, n]) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`h-8 rounded-full border border-line-input px-3 text-[12px] ${status === s ? "bg-mint text-forest-dark" : ""}`}
          >
            {COVERAGE_LABEL[s]} {n}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="h-40 animate-pulse rounded-[14px] bg-line" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-muted-ink">
              <tr>
                <th className="py-1 pr-3 font-medium">ทะเบียน</th>
                <th className="py-1 pr-3 font-medium">รหัส</th>
                <th className="py-1 pr-3 font-medium">แหล่ง</th>
                <th className="py-1 pr-3 font-medium">สถานะ</th>
                <th className="py-1 pr-3 font-medium">นาทีที่มีข้อมูล</th>
                <th className="py-1 pr-3 font-medium">ค่าน้ำมันใช้ได้</th>
                <th className="py-1 pr-3 font-medium">ข้อมูลล่าสุด</th>
                <th className="py-1 pr-3 font-medium">ระยะวิ่ง</th>
                <th className="py-1 font-medium">ถัง</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {shown.map((r) => (
                <tr key={`${r.plate}|${r.source}`} className="border-t border-line">
                  <td className="py-1 pr-3">{r.plate}</td>
                  <td className="py-1 pr-3">{r.truck_code ?? "–"}</td>
                  <td className="py-1 pr-3">{SOURCE_LABEL[r.source]}</td>
                  <td className="py-1 pr-3">{COVERAGE_LABEL[r.status]}</td>
                  <td className="py-1 pr-3">{r.minutes}</td>
                  <td className="py-1 pr-3">{Math.round(r.fuel_valid_share * 100)}%</td>
                  <td className="py-1 pr-3">{r.last ?? "–"}</td>
                  <td className="py-1 pr-3">{r.moved_km.toFixed(1)} กม.</td>
                  <td className="py-1">
                    {r.tank_l} L · {r.tank_from}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-3 text-[13px] text-muted-ink">ไม่มีข้อมูลของวันที่นี้</p>}
        </div>
      )}
    </section>
  )
}
```

`src/components/fuel/SettingsForm.tsx`:
```tsx
"use client"

import { useState } from "react"
import type { FuelSettings } from "@/lib/fuel-types"

type Props = { initial: FuelSettings; updatedAt: string | null; updatedBy: string | null; onSaved: () => void }

const FIELDS: { key: keyof FuelSettings; label: string; hint: string; step: string }[] = [
  { key: "auto_close_conf", label: "ความมั่นใจขั้นต่ำที่ปิดอัตโนมัติ", hint: "0.8–0.999 (ค่าเริ่ม 0.95)", step: "0.001" },
  { key: "audit_rate", label: "สัดส่วนตรวจสุ่มจากที่ปิดอัตโนมัติ", hint: "0–0.5 (ค่าเริ่ม 0.05 = 1 ใน 20)", step: "0.01" },
  { key: "price_per_litre", label: "ราคาน้ำมันต่อลิตร (บาท)", hint: "เว้นว่าง = ยังไม่ตั้ง (รายงานแสดงแค่ลิตร)", step: "0.01" },
]

/** ค่าที่ทีมปรับได้ (spec §4.6) — PUT /api/fuel/settings ต้องเข้าสู่ระบบ */
export function SettingsForm({ initial, updatedAt, updatedBy, onSaved }: Props) {
  const [values, setValues] = useState<Record<keyof FuelSettings, string>>({
    auto_close_conf: String(initial.auto_close_conf),
    audit_rate: String(initial.audit_rate),
    price_per_litre: initial.price_per_litre == null ? "" : String(initial.price_per_litre),
  })
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/fuel/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const body: unknown = await res.json().catch(() => null)
      const record = (body && typeof body === "object" ? body : {}) as { error?: unknown; saved?: unknown }
      if (!res.ok) {
        throw new Error(res.status === 401 ? "ต้องเข้าสู่ระบบใหม่ก่อนบันทึก" : String(record.error ?? `บันทึกไม่สำเร็จ (${res.status})`))
      }
      if (record.saved) {
        setMessage("บันทึกแล้ว — ใช้ในรอบคำนวณคืนนี้")
        onSaved()
      } else {
        setMessage("โหมดตัวอย่าง: ไม่ได้บันทึกลงฐานข้อมูล")
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
      <h3 className="text-[15px] font-semibold text-ink">ตั้งค่า</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-[13px] text-ink">
            {f.label}
            <input
              type="number"
              step={f.step}
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="mt-1 block h-9 w-full rounded-[12px] border border-line-input bg-surface px-2 text-[13px]"
            />
            <span className="text-[12px] text-muted-ink">{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="h-9 rounded-[12px] bg-forest px-4 text-[13px] font-semibold text-cream disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        {message && <span className="text-[13px] text-body">{message}</span>}
        {updatedBy && (
          <span className="text-[12px] text-muted-ink">
            แก้ล่าสุดโดย {updatedBy}
            {updatedAt ? ` · ${new Date(updatedAt).toLocaleString("th-TH")}` : ""}
          </span>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Report tab**

`src/components/fuel/ReportTab.tsx`:
```tsx
"use client"

import { useState } from "react"
import { exportToExcel } from "@/lib/exportToExcel"
import type { Report, ReportRow } from "@/lib/fuel-report"
import type { CoverageRow, FuelSettings } from "@/lib/fuel-types"
import { fmtDateKey } from "@/lib/thai-time"
import { DataStatusTable } from "./DataStatusTable"
import { SettingsForm } from "./SettingsForm"
import { useJson } from "./useJson"

type ReportResponse = { from: string; to: string; settings: FuelSettings; report: Report; rows: Record<string, string | number | null>[] }
type CoverageResponse = { date: string; rows: CoverageRow[] }
type SettingsResponse = { settings: FuelSettings; updated_at: string | null; updated_by: string | null }

const field = "mt-1 block h-9 rounded-[12px] border border-line-input bg-surface px-2 text-[13px] text-ink"

function RankTable({ title, rows }: { title: string; rows: ReportRow[] }) {
  return (
    <div className="rounded-[18px] border border-line bg-surface p-3">
      <h4 className="text-[13px] font-semibold text-ink">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted-ink">ยังไม่มี</p>
      ) : (
        <table className="mt-1 w-full text-[13px]">
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="py-1 pr-2 text-ink">{r.key}</td>
                <td className="py-1 pr-2 text-right text-body">{r.events} ครั้ง</td>
                <td className="py-1 pr-2 text-right text-body">{r.litres.toFixed(1)} L</td>
                <td className="py-1 text-right text-body">{r.baht == null ? "–" : `${r.baht.toLocaleString("th-TH")} ฿`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** สรุป & สถานะข้อมูล (spec §5.1 แท็บที่ 3) */
export function ReportTab() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [coverageDate, setCoverageDate] = useState("")

  const qs = new URLSearchParams()
  if (from) qs.set("from", from)
  if (to) qs.set("to", to)
  const report = useJson<ReportResponse>(qs.toString() ? `/api/fuel/report?${qs.toString()}` : "/api/fuel/report")
  const coverage = useJson<CoverageResponse>(coverageDate ? `/api/fuel/coverage?date=${coverageDate}` : "/api/fuel/coverage")
  const settings = useJson<SettingsResponse>("/api/fuel/settings")

  const r = report.data?.report
  const price = report.data?.settings.price_per_litre ?? null
  const weekMax = Math.max(1, ...(r?.byWeek ?? []).map((w) => w.litres))

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-[22px] border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-ink">น้ำมันที่ยืนยันว่าหาย</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] text-muted-ink">
              ตั้งแต่
              <input type="date" value={from || report.data?.from || ""} onChange={(e) => setFrom(e.target.value)} className={field} />
            </label>
            <label className="text-[12px] text-muted-ink">
              ถึง
              <input type="date" value={to || report.data?.to || ""} onChange={(e) => setTo(e.target.value)} className={field} />
            </label>
            <button
              type="button"
              disabled={!report.data?.rows.length}
              onClick={() => report.data && exportToExcel(report.data.rows, `fuel-losses-${report.data.from}-${report.data.to}.xlsx`)}
              className="h-9 rounded-[12px] border border-line-input bg-surface px-3 text-[13px] text-forest disabled:opacity-40"
            >
              ส่งออก Excel
            </button>
          </div>
        </div>
        {report.error && (
          <p role="alert" className="text-[14px] text-clay">
            {report.error}
          </p>
        )}
        {!r ? (
          <div className="h-24 animate-pulse rounded-[14px] bg-line" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">ยืนยันดูดจริง</dt>
                <dd className="text-[18px] font-semibold text-ink">{r.confirmed.events} ครั้ง</dd>
              </div>
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">ปริมาณ</dt>
                <dd className="text-[18px] font-semibold text-ink">{r.confirmed.litres.toFixed(1)} L</dd>
              </div>
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">มูลค่า{price != null ? ` (≈ ${price} ฿/L)` : ""}</dt>
                <dd className="text-[18px] font-semibold text-ink">
                  {r.confirmed.baht == null ? (
                    <span className="text-[13px] font-normal text-muted-ink">ยังไม่ได้ตั้งราคาน้ำมัน (ด้านล่าง)</span>
                  ) : (
                    `${r.confirmed.baht.toLocaleString("th-TH")} ฿`
                  )}
                </dd>
              </div>
              <div className="rounded-[14px] bg-cream px-3 py-2">
                <dt className="text-[12px] text-muted-ink">ทีมเห็นด้วยกับคำแนะนำ</dt>
                <dd className="text-[18px] font-semibold text-ink">
                  {r.acceptance.rate == null ? "–" : `${Math.round(r.acceptance.rate * 100)}%`}
                  <span className="ml-1 text-[12px] font-normal text-muted-ink">
                    ({r.acceptance.agreed}/{r.acceptance.decided})
                  </span>
                </dd>
              </div>
            </dl>
            <p className="text-[13px] text-body">
              ตรวจสุ่มจากที่ปิดอัตโนมัติ: {r.audit.checked} รายการ — ดูดจริง {r.audit.realLoss} · สัญญาณรบกวน {r.audit.noise} · ปกติ {r.audit.legit} ·
              ติดตาม {r.audit.followUp}
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              <RankTable title="ตามรถ" rows={r.byTruck} />
              <RankTable title="ตามคนขับ" rows={r.byDriver} />
              <RankTable title="ตามแพลนท์" rows={r.byPlant} />
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-ink">รายสัปดาห์</h4>
              {r.byWeek.length === 0 ? (
                <p className="text-[13px] text-muted-ink">ยังไม่มี</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {r.byWeek.map((w) => (
                    <li key={w.week} className="flex items-center gap-2 text-[13px]">
                      <span className="w-28 shrink-0 text-muted-ink">สัปดาห์ {fmtDateKey(w.week)}</span>
                      <span className="h-3 rounded-full bg-clay/70" style={{ width: `${(w.litres / weekMax) * 60}%` }} aria-hidden />
                      <span className="text-body">
                        {w.litres.toFixed(1)} L · {w.events} ครั้ง
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      <DataStatusTable
        date={coverageDate || coverage.data?.date || ""}
        rows={coverage.data?.rows ?? []}
        loading={coverage.loading}
        onDateChange={setCoverageDate}
      />

      {settings.data && (
        <SettingsForm
          key={settings.data.updated_at ?? "default"}
          initial={settings.data.settings}
          updatedAt={settings.data.updated_at}
          updatedBy={settings.data.updated_by}
          onSaved={settings.reload}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Gates and commit**

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/components/fuel/ReportTab.tsx src/components/fuel/DataStatusTable.tsx src/components/fuel/SettingsForm.tsx
git add src/components/fuel/ReportTab.tsx src/components/fuel/DataStatusTable.tsx src/components/fuel/SettingsForm.tsx
git commit -m "feat(fuel): report & data status tab — confirmed losses, acceptance, audit, coverage, settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Page shell, legacy route, end-to-end check

**Files:**
- Move: `src/app/fueldetection/page.tsx` → `src/app/fueldetection/legacy/page.tsx` (unchanged content)
- Create: `src/app/fueldetection/page.tsx` (new tabbed page)

**Interfaces:**
- Consumes: `QueueTab`, `TruckTab`, `ReportTab`.
- Produces: `/fueldetection?tab=queue|truck|report` (default `queue`; `?plate=` without `tab` opens `truck`, so the home page's plate search keeps working); `/fueldetection/legacy` (old page, one week).

- [ ] **Step 1: Move the old page**

```bash
mkdir -p src/app/fueldetection/legacy
git mv src/app/fueldetection/page.tsx src/app/fueldetection/legacy/page.tsx
```

- [ ] **Step 2: Create `src/app/fueldetection/page.tsx`**

```tsx
"use client"

import Link from "next/link"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { QueueTab } from "@/components/fuel/QueueTab"
import { ReportTab } from "@/components/fuel/ReportTab"
import { TruckTab } from "@/components/fuel/TruckTab"

const TABS = [
  { id: "queue", label: "คิวตรวจสอบ" },
  { id: "truck", label: "รายคัน" },
  { id: "report", label: "สรุป & สถานะข้อมูล" },
] as const
type TabId = (typeof TABS)[number]["id"]

function FuelDetectionTabs() {
  const params = useSearchParams()
  const router = useRouter()
  const requested = params.get("tab")
  // ?plate= จากช่องค้นหาหน้าแรก → เปิดแท็บรายคัน
  const tab: TabId = TABS.find((t) => t.id === requested)?.id ?? (params.get("plate") ? "truck" : "queue")

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">⛽ Fuel Detection</h1>
        <Link href="/fueldetection/legacy" className="text-[13px] text-muted-ink underline underline-offset-2">
          มุมมองเดิม (ชั่วคราว)
        </Link>
      </header>
      <nav role="tablist" aria-label="มุมมอง" className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(`/fueldetection?tab=${t.id}`)}
            className={`h-10 shrink-0 rounded-[12px] px-4 text-[14px] font-medium ${
              tab === t.id ? "bg-forest text-cream" : "border border-line bg-surface text-ink hover:bg-cream"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "queue" && <QueueTab />}
      {tab === "truck" && <TruckTab />}
      {tab === "report" && <ReportTab />}
    </div>
  )
}

export default function FuelDetectionPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense
  return (
    <Suspense>
      <FuelDetectionTabs />
    </Suspense>
  )
}
```

- [ ] **Step 3: Gates and build**

```bash
cp ../fuel-control-center/.env.local .env.local   # gitignored (.env*); build and dev need MONGO_URI
# Turbopack (Next 16 default, as on Vercel) refuses a node_modules symlink that points outside the project.
# Swap it for an APFS clone of the same packages: no install, no network, ~6 s, no extra disk.
# (Back to the symlink later: rm -rf node_modules && ln -s ../fuel-control-center/node_modules node_modules)
if [ -L node_modules ]; then rm node_modules && cp -c -R ../fuel-control-center/node_modules node_modules; fi
npm test
node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental false && echo tsc-ok
node_modules/.bin/eslint src/app/fueldetection/page.tsx src/components/fuel src/lib/fuel-*.ts src/lib/thai-time.ts src/app/api/fuel src/components/fueldetection/graph/FuelChart.tsx
node_modules/.bin/eslint src/app/fueldetection/legacy/page.tsx
npm run build
```
Expected: `ℹ fail 0`; `tsc-ok`; the first eslint prints nothing; the legacy page shows only its one pre-existing `no-explicit-any` error (line 12), unchanged from before the move; the build prints `▲ Next.js 16.0.10 (Turbopack)` and its route list includes `○ /fueldetection`, `○ /fueldetection/legacy` and `ƒ /api/fuel/events/[id]/decision`.

- [ ] **Step 4: Manual check in fixture mode**

```bash
lsof -ti tcp:3000 | head -1   # a pid here (e.g. mena-wms dev) → ask the user before stopping it; Google login is registered for localhost:3000
FUEL_FIXTURES=1 npm run dev
```
In the browser at `http://localhost:3000/fueldetection` (log in with an @menatransport.co.th Google account):
1. Queue: morning card for 5 ต.ค. — 537 คัน, ไม่มีข้อมูล 23 คัน, รอตรวจ 9, ~96 L; "ดูก่อน" lists สบ.71-8635 and สบ.70-6303; no AI text anywhere.
2. List shows 3 cards in this order: สบ.71-8635 (32.4 L · 87%), สบ.70-6303 (18.0 L · 62%), สบ.72-8334 (9.5 L, badge ตรวจสุ่ม).
3. Click สบ.71-8635: chart with the median line, pale noise band and a clay event band 02:10–02:35; the line stops at 03:00 (the 03:01 minute has no reading — a gap, not a drop to zero); Besttech/Terminus toggle switches to the 2-point Terminus line; hovering anywhere shows the nearest minute that has a value and never throws; evidence rows (ปริมาณ 32.4 L (16.2% ของถัง), ระยะเวลา 25 นาที, …); map pin; history "ไม่มีเหตุการณ์อื่น".
4. Press `2`: the card shows "ตัดสิน: สัญญาณรบกวน" and the panel moves to สบ.70-6303. Press `K` to go back, `1`: the note box focuses, the red save button stays disabled until 5 characters, `Ctrl+Enter` saves. `J`/`K` move, `Esc` closes.
5. Narrow the window to 375 px: single column; the panel covers the screen and "ปิด (Esc)" returns to the list.
6. Truck tab: plate `สบ.71-8635`, 2026-10-05 → 2026-10-06 → Besttech chart over both days and Terminus chart; plate `สบ.71-8623`, 2026-10-05 → 2026-10-05 → red banner "กล่อง Besttech ออฟไลน์ ไม่ส่งข้อมูลในช่วงที่เลือก" with "ข้อมูลล่าสุดในระบบ: 4 ต.ค. 10:01 (Besttech) · ตำแหน่งล่าสุด" (opens Google Maps).
7. Report tab: dates 2026-10-04 → 2026-10-05 → ยืนยันดูดจริง 1 ครั้ง · 41.0 L · มูลค่า "ยังไม่ได้ตั้งราคาน้ำมัน" (fixture settings have no price); เห็นด้วย 100% (2/2); Excel export downloads one row (สบ.71-8622); data status for 2026-10-05 lists สบ.71-8623 (กล่องออฟไลน์) first; settings "บันทึก" answers "โหมดตัวอย่าง: ไม่ได้บันทึกลงฐานข้อมูล".
8. `http://localhost:3000/fueldetection/legacy` still shows the old filter + chart and saves ranges as before (pick a plate from the risk list and a date range).

In a second terminal (no cookies, so no session):
```bash
curl -s -X POST "http://localhost:3000/api/fuel/events/x/decision" -H "Content-Type: application/json" -d '{"decision":"noise"}'
curl -s -X PUT "http://localhost:3000/api/fuel/settings" -H "Content-Type: application/json" -d '{}'
curl -s "http://localhost:3000/api/fuel/events?from=2026-10-05&status=pending"
```
Expected: `{"error":"ต้องเข้าสู่ระบบก่อนบันทึก"}` twice, then `{"error":"status ไม่ถูกต้อง"}`.

- [ ] **Step 5: Manual check against real data (Part 1 output)**

Stop the server and start it without fixtures: `npm run dev`.
1. Report tab → data status for 2026-10-05 lists the `gps_series` rows written by Part 1 (≈424 Terminus rows, plus Besttech once its run has written that day), problems first.
2. Truck tab → a Terminus plate from that list (for example `3ฒภ5383`) on 2026-10-05: a real minute-by-minute chart with the noise band.
3. Queue tab → "ยังไม่มีสรุปของวันที่ …" and "ไม่มีเหตุการณ์ตามตัวกรองนี้" until Part 2 writes `fuel_events` (no errors in the browser console or server log).
4. Once Part 2 has written a night of events (spec §7): decide one event with `2`, then confirm the newest `fuel_drop_reviews` document (one `findOne` sorted by `created_at: -1`) has that `event_id`, `decision: "noise"` and your email as `reviewer`, and the event shows `status: "decided"`. A truck with both boxes shows a Besttech and a Terminus chart; `สบ.71-8623` shows its no-data reason.

- [ ] **Step 6: Commit**

```bash
git add src/app/fueldetection/page.tsx src/app/fueldetection/legacy/page.tsx
git commit -m "feat(fuel): new tabbed /fueldetection page; old view kept at /fueldetection/legacy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After Part 3 (not tasks in this plan)

1. After one week on the new page: delete `src/app/fueldetection/legacy/`, `src/app/api/fuel-detection/`, the `src/components/fueldetection/` files only the legacy page uses (`FuelDetectionGraph`, `DetectedEventsList`, `SuspiciousCaseCard`, `ReviewPanel`, `filter`, `platelist`) and the detection half of `src/lib/fuel-analysis.ts`.
2. Merge `feat/fuel-redesign` and push only with the user's approval (push to `main` deploys to Vercel).
