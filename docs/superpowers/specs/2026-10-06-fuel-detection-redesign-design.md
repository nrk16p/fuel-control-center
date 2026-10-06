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
  plate: "สบ.71-8635",        // digits \d{2}-\d{4} + "สบ." prefix — same rule as mongodb-gps app/utils/plate.py
  truck_code: "ME152",         // Besttech code / Terminus รหัสพาหนะ
  date_key: "2026-10-05",
  date: ISODate("2026-10-04T17:00:00Z"),   // 00:00 Thai time; TTL field
  source: "besttech",          // besttech | terminus
  tank_l: 200, tank_from: "calibrated",    // atms | calibrated | default
  enc: 1,                      // codec version
  n: 1012,                     // number of minute buckets
  cols: {                      // BinData, little-endian, n values each
    m:       uint16,           // minute of day 0–1439
    fuel:    int16,            // median fuel in the minute, deci-litres (−1 = no valid reading)
    fuel_lo: int16,            // min in the minute, deci-litres
    fuel_hi: int16,            // max in the minute, deci-litres
    speed:   uint8,            // max km/h
    engine:  uint8,            // 1 if any reading had engine on
    lat:     int32,            // last reading of the minute × 1e5
    lng:     int32
  },
  coverage: { points, minutes, fuel_valid_share, max_gap_min, first, last, status },
  ingested_at: ISODate
}
```

- Codec: `scripts/fuel/series_codec.py` (numpy `tobytes`/`frombuffer`) and `src/lib/series-codec.ts` (typed arrays). Both carry round-trip tests.
- Indexes: `{date_key: 1, source: 1}`, `{plate: 1, date_key: -1}`, TTL on `date` (`expireAfterSeconds` = 400 days).
- Size: 18 bytes per minute → ~18 KB per doc → ~560 docs/day (424 Terminus + ~131 Besttech) → **~235 MB/month on disk**, flat after 13 months. Plain BSON arrays were estimated at ~500 MB/month, hence the packing.

### 3.2 Coverage status

| Status | Rule |
|---|---|
| `no_data` | truck in the vendor list / master but no readings all day (doc written without `cols` so the page can explain the gap) |
| `offline` | Besttech only: `/track` reports `OFFLINE`, or last `gps_time` is before the day |
| `no_sensor` | readings exist but every fuel value is invalid (Besttech −1, Terminus null/0) |
| `stuck` | `fuel_hi − fuel_lo == 0` on ≥ 95 % of engine-on minutes while the truck moved ≥ 50 km |
| `ok` | otherwise |

### 3.3 Jobs

All jobs live in `scripts/fuel/` and are registered in `routes/pipeline/pipeline_routes.py` (`PIPELINE_SCRIPTS`, `PIPELINE_NAMES`, `RUN_LOG_LOCATION` → `("analytics", "etl_jobs")`). They log through `JobLog` from `scripts/engineon/common.py` (same `sys.path` pattern as `scripts/maintenance`), so runs appear on FCC's Pipeline page. Default date = yesterday (Bangkok); `START_DATE` / `END_DATE` (dd/mm/YYYY) override, as in engine-on. Re-running a date overwrites (upsert by `_id`). Scheduler times in `main.py` are UTC.

| Pipeline type | Script | Schedule BKK (UTC) | What it does |
|---|---|---|---|
| `fuel_series_besttech` | `series_besttech.py` | 02:30 (19:30) | `/track` once (vehicle list + status) → `/history_all` × 24 one-hour windows, ≥ 35 s apart; on `error.TooManyRequests` wait 15/30/45/60 s → bucket → upsert |
| `fuel_series_terminus` | `series_terminus.py` | inside `fuel_nightly` | read yesterday's `terminus.driving_log` by `วันที่` (index `idx_date_plate_status_order_desc`) in batches of 50 trucks → bucket → upsert. Engine: `ดับเครื่อง` → 0, `จอดรถ` / `รถวิ่ง` → 1. Fuel: `น้ำมัน` (litres) |
| `fuel_events` | `pipeline_fuel_events.py` | inside `fuel_nightly` | Part 2 |
| `fuel_nightly` | `pipeline_fuel_nightly.py` | 04:15 (21:15) | runs Besttech again only if yesterday's Besttech docs are missing → Terminus → events. Engine-on reads the same day at 04:00 in ~50 s; this finishes before `atms_stockmovement` at 05:00 |
| `fuel_tanks` | `pipeline_fuel_tanks.py` | manual / after backfill | tank sizes (3.4) |
| `fuel_places` | `pipeline_fuel_places.py` | Mon 01:00 (Sun 18:00) | plants + Besttech POIs for the "at a place" feature (4.3) |
| `fuel_train` | `pipeline_fuel_train.py` | 2nd of month 03:30 (day 1, 20:30) | ML training + evaluation (4.5) |

Env (Render): `BESTTECH_API` (same key as the `mongodb-gps` secret), `BESTTECH_BASE_URL` (default `https://besttransportservice.bestgeosystem.com/apiservices`). Requests send `Content-Type: application/json` with no charset suffix (a suffix returns HTTP 415, per `mongodb-gps`). New dependency: `scikit-learn` (training only); `pytest` as a dev dependency.

### 3.4 Tank size (% → litres)

`analytics.fuel_tanks`: `{plate, tank_l, tank_from, fit_r2, n_pairs, updated_at}`. First source that applies:

1. **ATMS** `vehiclemaster.ความจุถังน้ำมัน` when numeric (`"200"`, `"200L"` → 200). Filled for 16 of 137 Besttech trucks.
2. **Calibrated** from Jun–Aug 2026, when trucks carried both boxes: pair Besttech % with Terminus litres within ±60 s while parked; fit `litres = k × %` through the origin; accept `tank_l = 100 k` when R² ≥ 0.9 and ≥ 200 pairs. A poor fit marks the sensor in the data-status tab.
3. **Default** 200 L, flagged.

Terminus series are already in litres; `tank_l` is used there only for "% of tank" features.

### 3.5 Backfill

- **Besttech:** 2026-05-26 → yesterday, a one-off resumable run of `fuel_series_besttech` (≈ 3,200 calls; ≈ 31 h at 35 s spacing, less if a shorter spacing proves safe — see §9). It pauses 09:00–10:00 BKK so it doesn't collide with `mongodb-gps`'s 09:25 Besttech ingest on the same key. ≈ 0.25 GB on disk.
- **Terminus:** (a) the ~716 truck-days behind the 78 reviews whose windows end on/after 2026-03-01 (training labels); (b) the last 30 days for all trucks (queue history, burn baselines). The 142 older reviews have no raw GPS left — Terminus data starts 2026-03-01.

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
- **Besttech down:** `fuel_nightly` retries the Besttech step once. If still missing, `sources_missing: ["besttech"]`, a red banner on the morning card, and Besttech trucks get `no_data` with the reason.
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
| Shortest safe spacing between Besttech calls | 35 s |
| Terminus `น้ำมัน` is litres for every truck | treat as litres; flag trucks whose max exceeds 400 |
| Calibration quality per Besttech truck | 200 L default, flagged |
| Besttech `/location` (POIs) works with our key | plants from `atms.plants` only |
| Terminus data for yesterday is complete by 04:15 | wait-and-retry rule in §6 |
