# Fuel Detection Redesign — Design

- **Date:** 2026-10-06
- **Status:** Draft for review
- **Repos:** `nrk16p/fuel-control-center` (page + API routes) · `nrk16p/api-ncac` (nightly jobs, detection, ML)
- **Main user:** fuel-control team (ทีมเชื้อเพลิง) — daily work queue

---

## 1. Why

Measured on 2026-10-06:

| Fact | Number |
|---|---|
| GPS source `/fueldetection` reads today | Terminus only (`terminus.driving_log`) |
| Asia/ลาดกระบัง concrete trucks on Besttech GPS | 139 in `gps.distance_besttech` · 137 in Besttech `/track` · 114 with fuel sensor configured |
| Of those, trucks still moving in Terminus | 132 in Jun → 112 in Aug → **32 in Sep 2026** |
| Fuel-equipped trucks per day | ~340 Terminus (80% of 424) + ~120 Besttech |
| Manual reviews per month (`fuel_drop_reviews`) | 41 · 54 · 51 (Jan–Mar) → 3–8 (Jun–Oct) |
| Current detector | runs in the browser, one truck at a time, one rule (≥ 15 L in ≤ 30 min while parked) |
| Mongo cluster disk | 46.5 / 58.9 GB used (79%) |

Problems:
1. FCC cannot see most Besttech trucks.
2. Nobody scans the whole fleet; manual review has nearly stopped.
3. Sensor noise and real siphoning look alike on a raw chart. Besttech readings within one minute spread ~4–5 % of tank (median) and up to ~10 % (p90) while moving, ≤ 0.5 % when parked, plus single-reading glitches of ±25 % that snap back within seconds (ME152, 2026-10-05).
4. The page draws an empty chart without saying why (71-8623: Besttech box offline since 11 Jun at อู่ MENA; Terminus 0 km since September).

## 2. Goal and success criteria

Every morning by 07:00 the fuel-control team opens `/fueldetection` and sees yesterday's fuel events for every fuel-equipped truck, whatever GPS box it has, ranked by likely litres lost. Each event carries a suggested decision, a confidence and the evidence behind it. The team confirms or overrides with one click; every decision becomes a training label.

Success:
1. Every fuel-equipped truck is analysed each day, or the page says why not (no sensor / box offline / stuck sensor / no data).
2. The system never decides "real loss" on its own. High-confidence noise/legit events close automatically and are spot-checked.
3. Suggestion acceptance is measured weekly. ML replaces the rules only when it beats them on held-out labels.

Decisions made during brainstorming:
- **Architecture A:** nightly jobs normalize Terminus + Besttech into our own compact store; the page reads only our Mongo, never vendor APIs.
- **Freshness:** nightly, for yesterday; queue ready by 07:00.
- **ML classifies and suggests. No LLM in this project.** The morning card keeps an empty `ai_text` slot for later.
- **Main reader:** the fuel-control team's work queue. Management reporting is a tab, not the focus.

Out of scope: moving Engine-on / Overspeed / Smart Distance onto `gps_series`; disk growth of the `terminus` database (~3.4 GB/month, separate issue); comparing refuels with refuel records; LLM summary; real-time alerts.

---

## 3. Part 1 — GPS data layer (api-ncac)

### 3.1 `analytics.gps_series`

One document per truck × day × source. Readings are grouped into 1-minute buckets (Thai time) and stored as packed binary columns to keep disk use low.

```js
{
  _id: "สบ.71-8635|2026-10-05|besttech",
  plate: "สบ.71-8635",        // digits \d{2}-\d{4} + "สบ." prefix — same rule as mongodb-gps app/utils/plate.py;
                               // other formats (15 of 424 Terminus plates, e.g. "กว4506") kept trimmed
  truck_code: "ME152",         // Besttech code / Terminus รหัสพาหนะ
  date_key: "2026-10-05",
  date: ISODate("2026-10-04T17:00:00Z"),   // 00:00 Thai time; TTL field
  source: "besttech",          // besttech | terminus
  fuel_unit: "cpct",           // unit of the fuel columns: "cpct" centi-percent (Besttech) | "dl" deci-litres (Terminus)
  tank_l: 200, tank_from: "calibrated",    // atms | calibrated | observed | default — re-stamped by fuel_tanks
  enc: 1,                      // codec version
  n: 1012,                     // number of minute buckets
  cols: {                      // BinData, little-endian, n values each
    m:       uint16,           // minute of day 0–1439
    fuel:    int16,            // median fuel in the minute, in fuel_unit (−1 = no valid reading)
    fuel_lo: int16,            // min in the minute
    fuel_hi: int16,            // max in the minute
    speed:   uint8,            // max km/h
    engine:  uint8,            // 1 if any reading had engine on
    lat:     int32,            // last reading of the minute × 1e5 (0 = no position)
    lng:     int32
  },
  coverage: { points, minutes, fuel_valid_share, max_gap_min, first, last, moved_km, status },
  ingested_at: ISODate
}
```

- Fuel stays in the vendor's own unit so a new tank size never forces a re-download: litres = `fuel / 10` for `dl`, `fuel / 10000 × tank_l` for `cpct`. Both codecs ship this conversion.
- `moved_km` is computed from consecutive positions (haversine, jumps > 5 km ignored); Terminus's per-row `ระยะทาง(กม.)` is always 0.

- Codec: `scripts/fuel/series_codec.py` (numpy `tobytes`/`frombuffer`) and `src/lib/series-codec.ts` (typed arrays). Both carry round-trip tests.
- Indexes: `{date_key: 1, source: 1}`, `{plate: 1, date_key: -1}`, TTL on `date` (`expireAfterSeconds` = 400 days).
- Size: 18 bytes per minute → ~18 KB per doc → ~560 docs/day (424 Terminus + ~131 Besttech) → **~235 MB/month on disk**, flat after 13 months. Plain BSON arrays were estimated at ~500 MB/month, hence the packing.

### 3.2 Coverage status

| Status | Rule |
|---|---|
| `no_data` | truck in the vendor list / master but no readings all day (doc written without `cols` so the page can explain the gap) |
| `offline` | Besttech only, no readings that day, and the box's last `gps_time` in `/track` is before the day (silent since then) |
| `no_sensor` | readings exist but every fuel value is invalid (Besttech −1, Terminus null/0) |
| `stuck` | fuel has a single value across all engine-on minutes while the truck moved ≥ 50 km (Terminus sends ~1 reading per minute, so a within-minute rule would flag every Terminus truck) |
| `ok` | otherwise |

### 3.3 Jobs

All jobs live in `scripts/fuel/` and are registered in `routes/pipeline/pipeline_routes.py` (`PIPELINE_SCRIPTS`, `PIPELINE_NAMES`, `RUN_LOG_LOCATION` → `("analytics", "etl_jobs")`). They log through `JobLog` from `scripts/engineon/common.py` (same `sys.path` pattern as `scripts/maintenance`), so runs appear on FCC's Pipeline page. Default date = yesterday (Bangkok); `START_DATE` / `END_DATE` (dd/mm/YYYY) override, as in engine-on. Re-running a date overwrites (upsert by `_id`). Scheduler times in `main.py` are UTC.

| Pipeline type | Script | Schedule BKK (UTC) | What it does |
|---|---|---|---|
| `fuel_series_besttech` | `series_besttech.py` | 01:30 (18:30) | `/track` once (vehicle list + status; an empty list is an error) → one per-vehicle `/history` call for the whole day (≤ 24 h per call), ≥ 35 s apart (~131 calls ≈ 76 min); boxes silent since before the day are not asked; on `error.TooManyRequests` wait 15/30/45/60 s; a vehicle that still errors is logged and written as `no_data`, and more than 25 % failed vehicles fails the day → bucket → upsert. `/history_all` is **not** used: measured 2026-10-06, it locks the key out of that endpoint for ≥ 20 min after ~7 calls |
| `fuel_series_terminus` | `series_terminus.py` | inside `fuel_nightly` | read yesterday's `terminus.driving_log` by `วันที่` (index `idx_date_plate_status_order_desc`) in batches of 50 trucks → bucket → upsert. Engine: `ดับเครื่อง` → 0, `จอดรถ` / `รถวิ่ง` → 1. Fuel: `น้ำมัน` (litres) |
| `fuel_events` | `pipeline_fuel_events.py` | inside `fuel_nightly` | Part 2 |
| `fuel_nightly` | `pipeline_fuel_nightly.py` | 04:15 (21:15) | runs Besttech again only if yesterday's Besttech docs are missing **and** no `fuel_series_besttech` run started < 2.5 h ago is still marked running (two clients on one key get throttled) → Terminus → events. Engine-on reads the same day at 04:00 in ~50 s |
| `fuel_tanks` | `pipeline_fuel_tanks.py` | manual | tank sizes (3.4) |
| `fuel_places` | `pipeline_fuel_places.py` | Mon 01:00 (Sun 18:00) | plants + Besttech POIs for the "at a place" feature (4.3) — built in the Part 2 plan |
| `fuel_train` | `pipeline_fuel_train.py` | 2nd of month 03:30 (day 1, 20:30) | ML training + evaluation (4.5) — built in the Part 2 plan |

Env (Render): `BESTTECH_API` (same key as the `mongodb-gps` secret), `BESTTECH_BASE_URL` (default `https://besttransportservice.bestgeosystem.com/apiservices`). Requests send `Content-Type: application/json` with no charset suffix (a suffix returns HTTP 415, per `mongodb-gps`). New dependency: `scikit-learn` (training only); `pytest` as a dev dependency.

### 3.4 Tank size (% → litres)

`analytics.fuel_tanks`: `{plate, tank_l, tank_from, fit_r2, n_pairs, updated_at}`. First source that applies:

1. **ATMS** `vehiclemaster.ความจุถังน้ำมัน` when numeric (`"200"`, `"200L"` → 200). Filled for 16 of 137 Besttech trucks.
2. **Calibrated** from Jun–Aug 2026, when trucks carried both boxes: pair Besttech % with Terminus litres in the same minute while both are parked; fit `litres = k × %` through the origin; accept `tank_l = 100 k` when R² ≥ 0.9 and ≥ 200 pairs. A poor fit marks the sensor in the data-status tab.
3. **Observed** (litre sensors): the largest reading in the last 30 days, rounded up to 10 L. Terminus maxima cluster at ~80, ~200 and ~390 L, so a flat default would be wrong for many trucks.
4. **Default** 200 L, flagged.

Terminus series are already in litres; `tank_l` is used there only for "% of tank" features. The job re-stamps `tank_l` / `tank_from` on existing `gps_series` docs (metadata only, columns untouched).

### 3.5 Backfill

**Declined by the user on 2026-10-06** — data starts with the nightly runs (plus 2026-10-05 from the smoke runs). The options below stay documented for later:

- **Besttech:** 2026-05-26 → yesterday, a one-off resumable run of `fuel_series_besttech`. With per-vehicle `/history` that is ≈ 13,300 known truck-days ≈ 130 h (~5.4 days) at 35 s; the last 30 days ≈ 38 h; the 12 calibration dates ≈ 10.5 h. It pauses 09:00–10:00 BKK so it doesn't collide with `mongodb-gps`'s 09:25 ingest on the same key.
- **Terminus:** (a) the ~716 truck-days behind the 78 reviews whose windows end on/after 2026-03-01 (training labels); (b) the last 30 days for all trucks (queue history, burn baselines, observed tank sizes); (c) the Besttech plates on 12 sample dates in Jun–Aug (1st, 8th, 15th, 22nd of each month) for tank calibration. The 142 older reviews have no raw GPS left — Terminus data starts 2026-03-01. ⚠️ A March purge of `driving_log` is planned; run (a) first if those labels should survive (`backfill_terminus_reviews.py`, minutes).

---

## 4. Part 2 — Detection, scoring and ML (api-ncac)

### 4.1 Steps per truck-day per source

`scripts/fuel/detect.py` holds pure functions (no I/O), unit-tested.

1. **Clean:** drop invalid fuel; Hampel filter on `fuel` (7-minute window, k = 3) removes single-reading spikes; parked minute = speed ≤ 5.
2. **Level:** plateau = a parked stretch lasting ≥ 5 min with no gap > 5 min between readings (a parked Besttech box reports only every ~3 min); plateau level = median fuel.
3. **Candidates** (sensitive on purpose — scoring decides later):
   - *drop*: plateau-to-plateau decrease ≥ 8 L beyond expected burn;
   - *refuel*: increase ≥ 20 L;
   - *gap*: data missing ≥ 10 min and the level after is ≥ 8 L lower, beyond expected burn.
   Candidates of the same kind less than 30 min apart merge.
4. **Evidence** per candidate (4.3).
5. **Classify and score** (4.4–4.6). Events from Terminus and Besttech for the same truck with overlapping windows merge into one event with `sources: ["besttech", "terminus"]` and `both_boxes: true`.

**Expected burn** per truck: litres per engine-on parked hour and litres per km, medians over its last 30 clean days (days with no candidates). Fleet median when a truck has fewer than 7 clean days.

All thresholds above are starting values, stored in `analytics.fuel_settings` and tuned against labels.

### 4.2 Classes, decisions, suggestions

- **Event class** (system): `noise` · `consumption` · `refuel` · `sensor_fault` · `suspected_loss` · `gap_loss`.
- **Decision** (reviewer): `real_loss` · `noise` · `legit` (refuel / normal consumption / drained for repair) · `follow_up`.
- **Suggested decision:** `suspected_loss`, `gap_loss` → `real_loss`; `noise`, `sensor_fault` → `noise`; `consumption`, `refuel` → `legit`.
- **Suggested action** (fixed rules, Thai text):
  - real loss while parked engine off → "เทียบใบเติมน้ำมัน + สอบถามคนขับ"
  - `gap_loss` → "ตรวจกล่อง GPS/สายไฟ ว่าถูกตัดไฟหรือไม่"
  - `sensor_fault` → "แจ้งผู้ให้บริการ GPS ตรวจเซนเซอร์"
  - ≥ 2 confirmed `real_loss` on the same truck or driver within 30 days → add "ส่งเรื่องหัวหน้าฟลีท"

### 4.3 Evidence (features)

| Feature | Meaning |
|---|---|
| `litres`, `pct_tank` | size of the change |
| `duration_min`, `rate_l_per_min` | how fast |
| `excess_over_burn_l` | change minus expected burn for the engine-on minutes and km in the window |
| `recovered_30/60/120` | level back within max(3 L, 2 % of tank) of the pre-event plateau after 30 / 60 / 120 min |
| `engine_off_share`, `moving_share` | engine and motion during the window |
| `gap_min` | longest data gap in the window |
| `sensor_noise_parked` | p90 of (`fuel_hi − fuel_lo`) on that day's parked minutes, % of tank |
| `at_place`, `place_name` | within 300 m of a plant (`atms.plants`, as engine-on uses) or inside a Besttech POI geofence (`analytics.fuel_places`) |
| `night` | starts between 18:00 and 06:00 |
| `both_boxes` | the other box saw it too |
| `truck_confirmed_30d`, `driver_confirmed_30d` | confirmed losses in the last 30 days |
| `source` | besttech / terminus |

Driver per truck-day comes from `analytics.engineon_trip_summary` (existing driver rule); `null` when unknown.

### 4.4 Rules v1 (day one)

| Class | Rule |
|---|---|
| `noise` | `recovered_30`, or the change appears only in moving minutes, or it was a Hampel-removed spike |
| `consumption` | `excess_over_burn_l` ≤ 5 L |
| `refuel` | rise ≥ 20 L that stays up ≥ 30 min |
| `sensor_fault` | day status `stuck`, or `sensor_noise_parked` > 10 % of tank |
| `gap_loss` | `gap_min` ≥ 10, `excess_over_burn_l` ≥ 8 L, not `recovered_60` |
| `suspected_loss` | otherwise: excess ≥ 8 L, not `recovered_60` |

**Score v1** (0–100, loss classes only): 50, +15 if `engine_off_share` ≥ 0.8, +10 `night`, +10 not `at_place`, +10 not `recovered_120`, +10 `rate_l_per_min` ≥ 1, +10 `both_boxes`, −20 if `sensor_noise_parked` > 3 % of tank; clamped. Non-loss events score 0. Under v1, `p_real_loss` = score / 100, so the queue sorts the same way before and after a model is active.

**Clear cases** (v1 auto-close candidates): a spike that reverts within 10 min; consumption with `excess_over_burn_l` ≤ 2 L; a refuel that stays up ≥ 60 min.

### 4.5 ML v2

- **Model:** logistic regression (scikit-learn, L2, `class_weight="balanced"`) on standardized 4.3 features plus `log(litres)`. It predicts `p_real_loss`. Logistic regression is chosen over gradient-boosted trees because labels are few (78 usable old reviews plus queue decisions) and its per-feature contributions (coefficient × value) give exact reasons. Trees are tried once there are more than 1,000 event labels.
- **Suggestion:** `p_real_loss` ≥ 0.5 → `real_loss`, confidence = p. Otherwise the rule class's mapping (`noise` / `legit`), confidence = 1 − p; a loss-class event the model rejects is suggested as `noise`. Loss-class events stay in the queue either way (4.6).
- **Reasons:** the 3 features with the largest contribution toward the suggestion, each mapped to a Thai phrase ("จอดดับเครื่อง", "ระดับไม่กลับขึ้นหลัง 2 ชม.", "ไม่ได้อยู่ในแพลนท์/อู่", "กลางคืน", "กล่อง GPS ขาดสัญญาณ"…). Under rules v1, reasons are the rules that fired.
- **Labels:**
  1. Queue decisions: `real_loss` = 1; `noise` / `legit` = 0; `follow_up` excluded until resolved.
  2. Weak labels from the 78 old reviews (weight 0.5): candidates inside `reviewed_ok` / `false_positive` windows = 0; the largest-excess candidate inside each `reviewed_suspicious` window = 1 (other candidates in that window excluded).
- **Evaluation:** time-based holdout (the most recent 30 % of labelled days).
  - *precision@20*: share of each day's top-20 ranked events labelled `real_loss`, averaged over days with at least one label.
  - *recall*: share of held-out `real_loss` labels ranked within their day's top 20.
- **Promotion:** a new model becomes active only if it beats the active scorer (rules v1 or the previous model) on precision@20 without lowering recall. Otherwise it is stored inactive with its report.
- **Minimum data:** training is skipped until there are ≥ 30 positive and ≥ 30 negative labels.
- **Storage:** `analytics.fuel_models` `{version, created_at, active, algo, features, coef, intercept, scaler_mean, scaler_scale, metrics, n_labels}`, plain numbers (no pickle). The nightly scorer needs only numpy; scikit-learn is used only in `fuel_train`.

### 4.6 Auto-close and audit

- `suspected_loss` and `gap_loss` are **never** auto-closed.
- Rules v1: auto-close only the clear cases (4.4). Model v2: auto-close a non-loss event when 1 − `p_real_loss` ≥ `auto_close_conf` (default 0.95).
- Audit: each auto-closed event goes back into the queue with probability `audit_rate` (default 1/20), marked "ตรวจสุ่ม". Its decision is a label like any other.
- `auto_close_conf`, `audit_rate` and `price_per_litre` live in `analytics.fuel_settings` and are editable on the page (5.1).

### 4.7 `analytics.fuel_events`

```js
{
  _id: "สบ.71-8635|2026-10-05T02:10",     // plate + start minute (Thai time)
  plate, truck_code, driver, date_key,
  start: ISODate, end: ISODate,
  sources: ["besttech"], kind: "drop",     // drop | refuel | gap
  class: "suspected_loss", litres: 34.2, pct_tank: 17.1,
  score: 87, p_real_loss: 0.87,
  suggestion: "real_loss", confidence: 0.87,
  reasons: ["จอดดับเครื่อง", "ระดับไม่กลับขึ้นหลัง 2 ชม.", "ไม่ได้อยู่ในแพลนท์/อู่"],
  action: "เทียบใบเติมน้ำมัน + สอบถามคนขับ",
  features: { /* 4.3 */ },
  place: { name, lat, lng },
  status: "open",            // open | auto_closed | audit | decided
  decision: null,            // real_loss | noise | legit | follow_up
  review_id: null,
  scorer: "rules-v1",        // or the model version, e.g. "lr-2026-11"
  stale: false,
  created_at, updated_at
}
```

- Indexes: `{date_key: -1, status: 1, score: -1}`, `{plate: 1, start: -1}`.
- Re-running a day replaces that day's `open` / `auto_closed` / `audit` events. New events are matched to existing `decided` events by plate + overlapping window (not by `_id`, since a start can shift by a minute); a match keeps the existing `_id` and decision. A `decided` event that is no longer detected is kept with `stale: true`.

### 4.8 `analytics.fuel_daily_summary`

```js
{
  _id: "2026-10-05",
  trucks_expected, trucks_analysed,
  by_status: { ok, no_sensor, offline, stuck, no_data },
  events, auto_closed, open, audit,
  likely_litres,            // Σ p_real_loss × litres over open loss events
  check_first: [event ids], // top 3 by p_real_loss × litres
  sources_missing: [],      // e.g. ["besttech"] when a vendor failed
  ai_text: null,            // reserved for a future LLM summary
  updated_at
}
```

---

## 5. Part 3 — Page (fuel-control-center)

### 5.1 `/fueldetection` (same URL, three tabs)

1. **คิวตรวจสอบ — Queue** (default; date = yesterday)
   - Morning card from `fuel_daily_summary`: trucks analysed / no data, events, auto-closed, waiting, likely litres; red banner when `sources_missing` is not empty; the 3 "check first" events.
   - Queue: event cards sorted by `p_real_loss × litres`. Filters: date range, class, branch / fleet / plant, source, status (waiting / decided / auto-closed / audit).
   - Event panel: chart ±3 h (median line + lo/hi noise band + speed + engine strip + night shading), evidence list, map pin, driver, this truck's events in the last 30 days, suggested decision pre-selected, 4 decision buttons, note (required for `real_loss`).
   - Keyboard: 1–4 decide, J/K next/previous, N focus note.
2. **รายคัน — Truck view:** plate + date range; Terminus/Besttech toggle when both exist; chart from `gps_series` with events marked. When there is no data the banner says why (coverage status + last data time + last place).
3. **สรุป & สถานะข้อมูล — Report & data status**
   - Report: confirmed litres and baht (× `price_per_litre`) by truck / driver / plant, weekly trend, suggestion acceptance rate, audit results; Excel export.
   - Data status: per truck — source(s), last data, coverage status, tank size and where it came from.
   - Settings: `auto_close_conf`, `audit_rate`, `price_per_litre`.

Mobile: single column; the event panel opens full-screen.

### 5.2 API routes (`src/app/api/fuel/…`)

| Route | Method | Returns / does |
|---|---|---|
| `/api/fuel/summary?date=` | GET | `fuel_daily_summary` |
| `/api/fuel/events?from&to&status&class&branch&fleet&plant&source&cursor` | GET | events, sorted by `p_real_loss × litres` |
| `/api/fuel/events/[id]` | GET | event + decoded `gps_series` slice ±3 h + this truck's events in the last 30 days |
| `/api/fuel/events/[id]/decision` | POST | `{decision, note}` → inserts into `fuel_drop_reviews`, sets the event to `decided` |
| `/api/fuel/series?plate&from&to&source` | GET | decoded series for the truck view |
| `/api/fuel/coverage?date=` | GET | per-truck data status |
| `/api/fuel/report?from&to` | GET | report aggregates |
| `/api/fuel/settings` | GET / PUT | `fuel_settings` |

The decision and settings writes require a signed-in session (next-auth) so the reviewer is recorded. Reads follow the app's current rule (pages guarded by `src/proxy.ts`, `/api/*` open).

### 5.3 Reviews

`fuel_drop_reviews` keeps its existing fields and documents. New reviews add `event_id`, a `decision` in the new vocabulary, `reviewer` = Google email (instead of "fuel team"), and the `suggestion` / `scorer` shown at decision time, so acceptance can be measured. Old decisions are untouched; for training they map as in 4.5.

### 5.4 Code reuse

- **Reuse:** `FuelChart.tsx` (extended for the noise band and `gps_series` input), `fuelOverlayPlugin.ts`, `ReviewPanel.tsx` (adapted to event decisions), `src/lib/dt-th.ts`, `exportToExcel.ts`, the Leaflet map setup.
- **Replace:** the browser-side detection in `src/lib/fuel-analysis.ts` (`smoothFuel`, `detectFuelEvents`); the server becomes the single source of events. Its Thai-time helpers stay.
- **Retire:** `/api/fuel-detection` (reads `driving_log` directly) once the truck view uses `/api/fuel/series`. `/dashboard` is untouched.

---

## 6. Errors and operations

- Every job logs start / finish / error to `analytics.etl_jobs` (visible on the Pipeline page) and can be re-run per date.
- **Besttech down:** `fuel_nightly` retries the Besttech step once (unless the 01:30 run is still going). If still missing, `sources_missing: ["besttech"]`, a red banner on the morning card, and Besttech trucks get `no_data` with the reason. Single-vehicle errors are isolated (written as `no_data`); network errors retry 5 times (10/30/60/120 s). A day that fails after the 04:15 catch-up is not retried automatically — re-run it with `START_DATE`/`FORCE=1` (or from the Part 4 Jobs tab).
- **Terminus late:** `fuel_nightly` compares yesterday's point count with the 7-day average. Below 50 % it waits 30 min and retries up to 3 times, then proceeds and flags the source.
- **Model problems:** if the active model can't load or a feature is missing, scoring falls back to rules v1 and records `scorer: "rules-v1"`.
- **Disk:** `gps_series` TTL keeps it flat at ~3 GB; the separate `terminus` growth is reported to the user, not handled here.

## 7. Testing

**api-ncac** (adds `pytest` as a dev dependency):
- `series_codec`: encode → decode round-trip, including −1 fuel and empty days.
- Bucketing: Besttech % → litres with `tank_l`; Terminus `สถานะ` → engine; per-minute median / lo / hi.
- `detect.py` on recorded fixtures (saved from the 2026-10-06 probe):
  - ME152, 2026-10-05: single-reading spikes (69.8 % → 45 %) and moving slosh → no loss event; steady fall 55 % → 36 % → consumption.
  - ME081, 2026-10-05: clean consumption → no loss event.
- `detect.py` on synthetic days: 30 L siphoned in 15 min, parked, engine off, stays down → `suspected_loss`; +8 % slosh while moving then back → `noise`; 40-min gap then −25 L → `gap_loss`; +80 L → `refuel`.
- Scorer: fixed coefficients → deterministic probability and reasons.
- Training: evaluation report on a held-out period; promotion rule.

**fuel-control-center:** `npm run build`; lint on changed files; a manual check on the dev server against real data — the queue loads, a decision saves and appears in `fuel_drop_reviews`, the truck view shows both sources for a dual-box truck, and 71-8623 shows its "no data" reason.

## 8. Rollout

Each part gets its own implementation plan, in this order:

1. **Part 1 — data layer:** `gps_series` + codec + jobs + backfill + tank calibration.
2. **Part 2 — detection & ML:** rules v1, `fuel_events`, `fuel_daily_summary`; the training job ships with it and activates a model only when one wins.
3. **Part 3 — page:** queue, truck view, report / data status / settings. The old view stays reachable for one week, then is removed.

Deploys: api-ncac `main` → Render auto-deploy; fuel-control-center `main` → Vercel. Both are pushed only after the user approves (push = deploy).

## 9. Verify during implementation

| Item | Default until verified |
|---|---|
| Shortest safe spacing between Besttech calls | 35 s — verified 2026-10-06: 10 s throttled on the 3rd call; 35 s held for ~138 `/history` calls with no throttling |
| Terminus `น้ำมัน` is litres for every truck | treat as litres; flag trucks whose max exceeds 400 |
| Calibration quality per Besttech truck | 200 L default, flagged |
| Besttech `/location` (POIs) works with our key | plants from `atms.plants` only |
| Terminus data for yesterday is complete by 04:15 | wait-and-retry rule in §6 |

---

## 10. Part 4 — Jobs tab (งานประจำ)

Added 2026-10-06. User decisions: all three `~/Documents/project/schedule_fuel` jobs move into api-ncac; engine_on_v2 becomes an **optional parameter** of the existing `engineon` pipeline (the nightly keeps today's logic); cron times are **fixed in code** and shown read-only.

### 10.1 Why

| Job today | How it runs | Problem |
|---|---|---|
| `cal_overspeed/etl_overspeed_v4.py` | edit the dates at the top, run by hand | no schedule; ⚠️ a Mongo username + password typed into the file |
| `Cpac_compen/compensation_cpac/rmc_daily/rmc_daily.py` | launchd `com.cpac.rmc-daily` on this Mac, 09:00 | stops when the Mac is off; state in a local `state.json`; the 2026-09-28 bug silently pushed 0 rows on 32 days |
| `engine_on_v2/process_engineon.py` | by hand | an unmerged variant of the nightly `engineon` pipeline writing the same collections |

Goal: one tab where the fuel team runs any of these with parameters, sees when each runs automatically, and sees how its last runs went — without editing code or keeping a Mac awake.

### 10.2 Jobs

| Card | Pipeline type | Script (api-ncac) | Auto BKK (UTC) | Parameters (default) | Writes | Env on Render |
|---|---|---|---|---|---|---|
| Overspeed | `overspeed` (new) | `scripts/overspeed/pipeline_overspeed.py` | 04:30 (21:30) | `START_DATE`/`END_DATE` dd/mm/YYYY (yesterday) · `PLATES` comma list (all) · `MIN_DURATION_MIN` (2) · `MIN_RECORDS` (5) · `GAP_MINUTES` (2) | `analytics.overspeed`, delete + insert per plate × day | `MONGODB_URI` (exists) |
| CPAC RMC compensation | `rmc_compensation` (new) | `scripts/rmc/pipeline_rmc.py` | 09:00 (02:00) | `DATE` yyyy-mm-dd, or `START` + `END` (inclusive) · `DRY_RUN` (false) · none = catch up from the last good day, ≤ 14 days per run | pushes to `API_PUSH` (upsert); state in `analytics.etl_state` | `POST_URL`, `API_PUSH` (secrets — `POST_URL` may carry a token) |
| Engine-on | `engineon` (existing) | `scripts/engineon/pipeline_engineon.py` | 04:00 (21:00), unchanged | `START_DATE`/`END_DATE` (yesterday) · `MAX_DISTANCE` (200) · **`ENGINE_LOGIC` `current`/`v2` (`current`)** | `raw_engineon` + `summary_engineon` | — |
| Fuel series *(small addition)* | `fuel_series_besttech`, `fuel_series_terminus`, `fuel_nightly`, `fuel_tanks` (Part 1) | existing | 01:30 / in chain / 04:15 / manual | `START_DATE`/`END_DATE`, `FORCE`; `PLATES` for Terminus | `gps_series`, `fuel_tanks` | `BESTTECH_API` |

The fuel-series cards close the Part 1 review gap (FCC could not trigger those jobs) and are what §6 means by "re-run from the Jobs tab".

**Overspeed port**
- Same segment logic and output fields as `etl_overspeed_v4.py` (speed groups `>70` and `60-70`, gap / minimum duration / minimum records), so `/overspeed` is unchanged.
- Reads only the fields it needs through the `วันที่`-first index; today's script loads whole documents.
- Re-runs delete the day's rows for every plate processed, even one that now has no segment (today a stricter re-run leaves stale rows behind).
- ⚠️ **Security:** the password in the current script is not carried over — the job uses `MONGODB_URI`. Rotate that password: api-ncac is a **public** GitHub repo, so the old file must never be copied into it.
- Kept as-is and noted: Terminus `ระยะทาง(กม.)` is always 0, so `sum_distance_km` is 0 and `w_speed` empty; overspeed covers Terminus trucks only. Both are follow-ups (distance from coordinates; Besttech via `gps_series`).

**RMC port**
- Same fetch → tier → push logic and the same tiers (91–119 / 120–150 / > 150 min; ML 1/2/3, MS 0.5/1/1.5), including the 2026-09-28 fix for numeric truck codes read as `6496.0`.
- State: `analytics.etl_state` doc `{_id: "rmc_compensation", last_success_date, updated_at}`, seeded from the Mac's `state.json` at cutover. Default runs process each missed day through yesterday, one day at a time, advancing the state only after that day's push succeeds. `DATE` / `START`–`END` / `DRY_RUN` never touch the state — as today.
- **New guard:** a day that fetched trips but sends 0 rows after the vehicle mapping fails and does not advance the state (the 32 lost days would have shown up as failures).
- Vehicle mapping (`vehicle.json`, 591 rows incl. driver names) moves to **Mongo** `analytics.rmc_vehicles`, loaded once at cutover — not into the repo, because api-ncac is public and the file holds personal data; it can also be updated without a deploy.
- Logs go to `etl_jobs` (per-day rows fetched / sent / created / updated) instead of local log files.
- Cutover: the Render job runs alongside the Mac's launchd for 3 days (pushes are upserts, so a day pushed twice is updated, not duplicated); compare counts; then `launchctl unload` `com.cpac.rmc-daily` and archive the folder. The 32 zero-row days (07-29 → 09-27) become a one-click `START`–`END` run, done only when the user asks.

**Engine-on logic parameter**
- `ENGINE_LOGIC=v2`: boxes with v1-type voltage count every parked (`จอดรถ`) reading as engine-on; v2 boxes keep the ≥ 25 V rule; every record carries `confirmed_by_voltage` (true for v2 boxes). `current` (default) is today's nightly logic, unchanged.
- A v2 run overwrites `raw_engineon` / `summary_engineon` for its dates. `/engineon` reads `engineon_trip_summary`, so the card offers "rebuild trip summary for these months" (on by default), which queues `engineon_trip_summary` (`YEAR`/`MONTH`) after the engine-on run.
- Named `ENGINE_LOGIC`, not `VERSION_TYPE`, because the trip summary already uses `VERSION_TYPE` as a filter.

**Schedule check against `main.py` (UTC)**

| New job | Neighbours | Why it is safe |
|---|---|---|
| overspeed 21:30 | engineon 21:00 (~1 min), fuel_nightly 21:15 (~1–2 min, may sleep while waiting for Terminus), atms_stockmovement 22:00 (heavy writes) | reads the same day engine-on has just read, through the index; a few minutes of work, done before 22:00 |
| rmc 02:00 | `ld` 02:00, finance overdue reminder 09:00 BKK | RMC only talks to CPAC fleetlink and the push API and writes one state doc — no shared system with `ld`, light load |

### 10.3 The tab

- `/pipeline` gets two tabs: **ETL** (today's view, unchanged) and **งานประจำ**.
- One card per job: name and a one-line Thai description; the schedule read-only ("อัตโนมัติทุกวัน 04:30"); the last 5 runs from `etl_jobs` (status, start, duration, records, error on hover); the parameter form; **Run**. Runs go through the page's existing single-runner queue and polling; forms reuse `BaseRunModal`.
- Validation before sending: end ≥ start; at most 7 days per run for jobs that read `driving_log` (≈ 519k rows per day — split longer ranges), 3 days for `fuel_series_besttech` (≈ 76 min per day), 14 for RMC; `DATE` or `START`+`END`, not both; numbers are positive integers.
- **Run** needs a signed-in session: `POST /api/pipeline/[type]` checks next-auth (this also covers the ETL tab's buttons). Reading status stays as today.
- Mobile: cards stack; the form opens full-screen.

### 10.4 API changes

- api-ncac: register `overspeed` and `rmc_compensation` (`PIPELINE_SCRIPTS` / `PIPELINE_NAMES` / `RUN_LOG_LOCATION` → `analytics.etl_jobs`, `JobLog`); `engineon` reads `ENGINE_LOGIC`; cron in `main.py`: overspeed `CronTrigger(hour=21, minute=30)`, rmc `CronTrigger(hour=2, minute=0)`.
- FCC proxy `src/app/api/pipeline/[type]/route.ts`: `TYPE_MAP` gains `overspeed`, `rmc-compensation`, `fuel-series-besttech`, `fuel-series-terminus`, `fuel-nightly`, `fuel-tanks`; each type gets an allow-list of parameter keys (unknown keys dropped, on top of `STRIP_KEYS`); POST requires a session.
- Last runs per card: the existing `/api/etl_jobs` gains `job_type` and `limit` filters.

### 10.5 Tests

- api-ncac (pytest): overspeed segment builder on fixture rows (both speed groups, gap split, minimum duration / records, zero-distance weighted speed) and the stale-row delete on re-run; RMC tiers at the boundaries, the `.0` code regression, the 0-rows-sent guard, state advancing only on success, `DATE` / `START`–`END` / `DRY_RUN` not touching state, the 14-day cap; engine-on classification for v1/v2 boxes under both `ENGINE_LOGIC` values and `confirmed_by_voltage`.
- FCC (`npm test`): per-job parameter validation and payload builders.
- Smoke, each only with the user's go-ahead: overspeed for yesterday (row counts vs. the script's last run of that day); RMC `DRY_RUN` for yesterday, then a real run; engine-on v2 for one day, then the trip-summary rebuild.

### 10.6 Rollout

1. api-ncac branch (from `main` once Part 1 has landed): overspeed + rmc + `ENGINE_LOGIC` + registry and cron.
2. FCC: the tab and proxy changes (separate commit set; can ride with Part 3).
3. Deploy only after approval: add `POST_URL` / `API_PUSH` on Render; seed `etl_state` and `rmc_vehicles`; 3-day RMC parallel run, then retire launchd; stop running the local overspeed script.

### 10.7 Out of scope

Editing schedules from the UI; overspeed for Besttech trucks; computing distance from coordinates; the 32-day RMC re-push until asked; the old `rmc_compensation.py` / `ext_data.py` scripts (superseded by `rmc_daily`); deleting `schedule_fuel` (archive after cutover).
