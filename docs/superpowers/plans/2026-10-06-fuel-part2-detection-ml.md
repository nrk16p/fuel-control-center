# Fuel Redesign Part 2 — Detection, Scoring and ML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every night, turn yesterday's `analytics.gps_series` into scored fuel events — candidates, evidence, class, a suggested decision with Thai reasons, auto-close/audit status — plus a daily summary, weekly known places and a monthly model trainer.

**Architecture:** Pure, unit-tested modules in `api-ncac/scripts/fuel/` (settings, places, detect, baseline, features, rules, model, events) feed one job, `fuel_events`, which runs as the last step of `fuel_nightly` and can be re-run per date. Rules v1 score events from day one; `fuel_train` fits a logistic regression on queue decisions and promotes it only when it beats the active scorer. The nightly scorer needs numpy only; scikit-learn is used only by the monthly trainer. No LLM.

**Tech Stack:** Python 3.11+, numpy, pymongo (existing), scikit-learn (new, training only), pytest.

**Spec:** `docs/superpowers/specs/2026-10-06-fuel-detection-redesign-design.md` — §4 (Part 2), §3.3 (fuel_events / fuel_places / fuel_train jobs), §6, §7. Builds on Part 1 as implemented on `feat/fuel-gps-series` (see the Part 1 plan and its ledger rulings).

## Global Constraints

- Work only in a new worktree branched from Part 1: `~/Documents/project/ncac/api-ncac-fuel-p2`, branch `feat/fuel-events`, from `feat/fuel-gps-series` (Task 1 Step 1). Never in `api-ncac` or `api-ncac-fuel`.
- Never push. Steps marked **⚠️ PROD** write to production Mongo or call Besttech — ask the user before each one.
- No LLM anywhere; `fuel_daily_summary.ai_text` is always `null`.
- `scikit-learn` is imported only inside `train.fit` (monthly job). The nightly path (`detect`, `baseline`, `features`, `rules`, `model`, `events`) imports numpy only.
- Scheduler `CronTrigger` hours in `main.py` are UTC (BKK − 7).
- Restore `__pycache__/database.cpython-314.pyc` after test runs (it is tracked by mistake); never `git add -A`.
- Thai strings (reasons, actions) are copied exactly as written here — Part 3 shows them verbatim.
- Thresholds live in `analytics.fuel_settings` (`_id: "default"`), defaults in `fuel_settings.DEFAULTS`; code reads them through `load_settings`.
- Event `_id` = `"<plate>|<YYYY-MM-DD>T<HH:MM>"` (start minute, Thai time); `start`/`end` are naive UTC datetimes.

## Interface contract with Part 3 (the page)

- `analytics.fuel_events` — spec §4.7 fields: `_id, plate, truck_code, driver, date_key, start, end, sources, kind, class, litres, pct_tank, score, p_real_loss, suggestion, confidence, reasons, action, features, place {name, lat, lng}, status (open | auto_closed | audit | decided), decision, review_id, scorer, stale, created_at, updated_at`. `features` holds every §4.3 item plus `expected_burn_l, level_before, level_after, recovered_10, rebound_60, stays_up_30/60 (refuel), day_rise_l, spikes_removed, start_min, end_min, lat, lng, place_name, where`.
- Part 3 writes decisions: set `status: "decided"`, `decision`, `review_id` on the event and insert a `fuel_drop_reviews` doc with `event_id, decision, reviewer, suggestion, scorer, note` (spec §5.3). A re-run keeps decided events (matched by plate + overlapping window); **open events may be replaced under a new `_id`** if their start minute shifts — the decision route must answer 404 cleanly for a vanished `_id`.
- `analytics.fuel_daily_summary` — spec §4.8 plus `by_status.sparse` and a `decided` count.
- `analytics.fuel_settings` — one doc `_id: "default"`; the page edits `auto_close_conf`, `audit_rate`, `price_per_litre` (default `null` = not set).
- `driver` = `engineon_trip_summary.Supervisor` for `"<raw plate>_<date>"` (the engine-on report's พจส), `null` when unknown.

## Rulings made while planning (spec → plan, with dry-run evidence)

1. **Candidates use raw litres** (drop ≥ 8 L, rise ≥ 20 L); the class compares the change with expected burn (spec §4.1 said "≥ 8 L beyond expected burn"). Without this, `consumption` (spec §4.2, §7) could never occur and the model would get no negatives.
2. **Two extra noise signals** besides `recovered_30`: the level climbs back at least half the drop within 60 min (`rebound_60`), or the drop is no bigger than 1.5 × the litres the same sensor rose that day without a refuel (`day_rise_l`). The two real Besttech days in spec §7 (ME152, ME081, 2026-10-05) otherwise raise false losses: ME152 "drops" 23 L parked with the engine on and is back up 18 L within 35 min; its sensor rises 56 L in the day without any refuel.
3. **`sensor_noise_parked` = p90 of |reading − 5-min rolling level| on parked minutes** (% of tank), not `fuel_hi − fuel_lo` — Terminus sends ~1 reading per minute, so the within-minute spread is always 0.
4. **Expected burn = idle L/h × parked engine-on hours + L/km × km** (moving engine-on time is already inside the per-km rate). Mixers burn fuel with the drum running while parked, so parked engine-on time must count.
5. `excess_over_burn_l` between 5 and 8 L is classed `consumption` (not clear) — the spec left that band unclassified.
6. Baselines use raw daily observations including today (medians, no event filtering) so the first night already has a fleet baseline.
7. Rules v1 confidence for non-loss events is a constant: 0.95 when clear, 0.7 otherwise (v1 has no probability for them).

## Review Focus

- **Noisy real sensors** (drum, slope, slosh, single-reading spikes) must not raise loss events — Task 5 `test_noisy_real_day_has_no_loss_event[ME152|ME081]`, `test_me152_spikes_are_removed`.
- **Sparse sensors** (< 10 % valid fuel minutes) must give no events and be counted `sparse` — Task 8 `test_run_day_stores_events_stats_and_summary`.
- **A re-run must keep reviewers' decisions** and never delete a decided event — Task 7 `test_plan_rerun_keeps_decisions`, Task 8 `test_rerun_keeps_the_reviewers_decision`, `test_write_events_never_deletes_decided`.
- **A loss the model rejects** is suggested as noise but stays in the queue — Task 7 `test_score_v2_uses_model_and_never_auto_closes_a_suggested_loss`.
- **Besttech /location down** must still refresh plants — Task 9 `test_besttech_down_still_writes_plants`.

Known limitation (not handled in Part 2): a siphon spanning midnight is split across two days and each half may stay under 8 L.

---

### Task 1: Worktree, settings, places, Besttech /location

**Files:**
- Create: `scripts/fuel/fuel_settings.py`, `scripts/fuel/places.py`
- Modify: `scripts/fuel/besttech_client.py` (add `location`)
- Test: `scripts/fuel/tests/test_fuel_settings.py`, `scripts/fuel/tests/test_places.py`, `scripts/fuel/tests/test_besttech_client.py` (append)

**Interfaces:**
- Produces: `fuel_settings.SETTINGS = "fuel_settings"`, `SETTINGS_ID = "default"`, `DEFAULTS: dict`, `merge_settings(stored) -> dict`, `load_settings(db) -> dict`; `places.haversine_m(...) -> float`, `point_in_polygon(lat, lng, polygon) -> bool`, `find_place(lat, lng, places) -> dict | None`, `plant_places(rows) -> list[dict]`, `besttech_places(rows) -> list[dict]` (docs `{_id, kind, code, name, lat, lng, radius_m, polygon}`); `BesttechClient.location(since=None) -> list[dict]`.

- [ ] **Step 1: Create the worktree and env**

```bash
cd ~/Documents/project/ncac/api-ncac-fuel
git log --oneline -1 feat/fuel-gps-series
git worktree add -b feat/fuel-events ../api-ncac-fuel-p2 feat/fuel-gps-series
cd ../api-ncac-fuel-p2
cp ../api-ncac-fuel/scripts/.env scripts/.env && chmod 600 scripts/.env
python3 -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt scikit-learn
.venv/bin/python -m pytest scripts/fuel/tests -q | tail -1
```
Expected: the Part 1 suite passes (`76 passed` if Part 1 ended with 76 fuel tests).

- [ ] **Step 2: Write the failing tests**

`scripts/fuel/tests/test_fuel_settings.py`:
```python
from fuel_settings import DEFAULTS, merge_settings


def test_defaults_when_nothing_stored():
    assert merge_settings(None) == DEFAULTS
    assert DEFAULTS["auto_close_conf"] == 0.95 and DEFAULTS["audit_rate"] == 0.05 and DEFAULTS["price_per_litre"] is None


def test_stored_values_override_known_keys_only():
    merged = merge_settings({"_id": "default", "auto_close_conf": 0.9, "price_per_litre": 31.5,
                             "min_drop_l": None, "unknown": 1})
    assert merged["auto_close_conf"] == 0.9 and merged["price_per_litre"] == 31.5
    assert merged["min_drop_l"] == DEFAULTS["min_drop_l"] and "unknown" not in merged and "_id" not in merged
```

`scripts/fuel/tests/test_places.py`:
```python
import pytest

from places import besttech_places, find_place, haversine_m, plant_places, point_in_polygon

SQUARE = [{"lat": 13.0, "lng": 100.0}, {"lat": 13.0, "lng": 100.01}, {"lat": 13.01, "lng": 100.01},
          {"lat": 13.01, "lng": 100.0}]


def test_haversine():
    assert haversine_m(13.0, 100.0, 13.0, 100.0) == 0
    assert haversine_m(13.0, 100.0, 13.001, 100.0) == pytest.approx(111.2, abs=0.5)


def test_point_in_polygon():
    assert point_in_polygon(13.005, 100.005, SQUARE)
    assert not point_in_polygon(13.02, 100.005, SQUARE)


def test_plant_places_from_atms_rows():
    rows = [{"client": "ACON", "plant_code": "A109", "Latitude": "14.0543628", "Longitude": "100.5684819"},
            {"client": "X", "plant_code": "", "Latitude": "14.0", "Longitude": "100.0"},
            {"client": "X", "plant_code": "B1", "Latitude": "nan", "Longitude": "100.0"}]
    assert plant_places(rows) == [{"_id": "plant:A109", "kind": "plant", "code": "A109", "name": "ACON A109",
                                   "lat": 14.0543628, "lng": 100.5684819, "radius_m": 300.0, "polygon": []}]


def test_besttech_places_keep_active_with_shape():
    rows = [{"code": "L008", "name": "LAB วัชรพล", "lat": 13.86578, "lng": 100.643171, "radius": 0,
             "geofence": SQUARE[:3] + [SQUARE[3]], "status": "A"},
            {"code": "L009", "name": "อู่ MENA", "lat": 13.76, "lng": 100.76, "radius": 150, "geofence": [], "status": "A"},
            {"code": "L010", "name": "old", "lat": 13.0, "lng": 100.0, "radius": 0, "geofence": [], "status": "D"}]
    out = besttech_places(rows)
    assert [p["_id"] for p in out] == ["besttech:L008", "besttech:L009"]
    assert len(out[0]["polygon"]) == 4 and out[1]["radius_m"] == 150.0 and out[1]["polygon"] == []


def test_find_place_nearest_containing():
    places = [{"name": "far", "lat": 13.0, "lng": 100.0, "radius_m": 300.0, "polygon": []},
              {"name": "near", "lat": 13.0005, "lng": 100.0, "radius_m": 300.0, "polygon": []},
              {"name": "poly", "lat": 13.005, "lng": 100.005, "radius_m": 0.0, "polygon": SQUARE}]
    assert find_place(13.0006, 100.0, places)["name"] == "near"
    assert find_place(13.009, 100.009, places)["name"] == "poly"
    assert find_place(14.0, 100.0, places) is None and find_place(None, None, places) is None
```

Append to `scripts/fuel/tests/test_besttech_client.py` (two blank lines before it):
```python
def test_location_body_and_rows():
    resp = FakeResp({"what": "ok", "info": [{"code": "L008", "name": "LAB"}]})
    client, session, _ = make([resp, FakeResp({"what": "ok", "info": []})])
    assert client.location() == [{"code": "L008", "name": "LAB"}]
    assert session.calls[0]["url"].endswith("/apiservices/location") and session.calls[0]["json"] == {}
    assert client.location("2026-06-01") == []
    assert session.calls[1]["json"] == {"since_modified_date": "2026-06-01"}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_fuel_settings.py scripts/fuel/tests/test_places.py scripts/fuel/tests/test_besttech_client.py -q`
Expected: `No module named 'fuel_settings'`, `No module named 'places'`, and `AttributeError: 'BesttechClient' object has no attribute 'location'`.

- [ ] **Step 4: Implement**

`scripts/fuel/fuel_settings.py`:
```python
"""Detection thresholds and queue settings — analytics.fuel_settings, one document `_id: "default"`
(spec §4.1, §4.6). Values stored in Mongo override these defaults key by key; the page edits
auto_close_conf, audit_rate and price_per_litre."""

SETTINGS = "fuel_settings"
SETTINGS_ID = "default"

DEFAULTS = {
    # detection (spec §4.1 — starting values, tuned against labels)
    "min_drop_l": 8.0,          # candidate drop between two parked levels
    "refuel_min_l": 20.0,       # candidate rise
    "gap_min": 10,              # minutes without data that count as a gap
    "merge_min": 30,            # same-kind candidates closer than this merge
    "plateau_min": 5,           # a parked stretch this long gives a trusted level
    "parked_kmh": 5,            # speed at or below this counts as parked
    "hampel_window_min": 7,     # spike filter window
    "hampel_k": 3.0,            # spike filter threshold in MADs
    "spike_min_l": 3.0,         # never call a deviation smaller than this a spike …
    "spike_min_pct": 2.0,       # … nor smaller than this % of the tank
    "recover_tol_l": 3.0,       # "recovered" = back within max(tol_l, tol_pct % of tank) …
    "recover_tol_pct": 2.0,     # … of the level before the event
    "sparse_share": 0.1,        # trucks with fewer valid fuel minutes are not analysed
    # rules v1 (spec §4.4)
    "consumption_max_l": 5.0,   # excess over expected burn at or below this = consumption
    "clear_consumption_l": 2.0,  # … and at or below this = clear (auto-close)
    "noisy_sensor_pct": 3.0,    # parked noise above this lowers the score
    "faulty_sensor_pct": 10.0,  # parked noise above this = sensor_fault
    # burn baselines (spec §4.1)
    "baseline_days": 30,
    "baseline_min_days": 7,
    # queue (spec §4.6, §5.1)
    "auto_close_conf": 0.95,
    "audit_rate": 0.05,         # 1 in 20 auto-closed events goes back to the queue
    "price_per_litre": None,    # baht; the report shows litres only until this is set
}


def merge_settings(stored: dict | None) -> dict:
    stored = stored or {}
    return {**DEFAULTS, **{k: v for k, v in stored.items() if k in DEFAULTS and v is not None}}


def load_settings(db) -> dict:
    return merge_settings(db[SETTINGS].find_one({"_id": SETTINGS_ID}))
```

`scripts/fuel/places.py`:
```python
"""Known places for the "at a place" evidence (spec §4.3) — pure functions.

analytics.fuel_places documents: {_id, kind: "plant" | "poi", code, name, lat, lng, radius_m, polygon}
  plant  atms.plants (the coordinates engine-on uses), a 300 m circle
  poi    Besttech /location: polygon geofence when given, else its radius, else a 300 m circle
"""
import math

PLANT_RADIUS_M = 300.0
EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (lat1, lng1, lat2, lng2))
    a = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(min(max(a, 0.0), 1.0)))


def point_in_polygon(lat: float, lng: float, polygon: list[dict]) -> bool:
    """Ray casting on (lng, lat); polygon = [{"lat", "lng"}, ...] with at least 3 points."""
    inside = False
    n = len(polygon)
    for i in range(n):
        a, b = polygon[i], polygon[(i + 1) % n]
        if (a["lat"] > lat) != (b["lat"] > lat):
            x = a["lng"] + (lat - a["lat"]) * (b["lng"] - a["lng"]) / (b["lat"] - a["lat"])
            if lng < x:
                inside = not inside
    return inside


def find_place(lat: float | None, lng: float | None, places: list[dict]) -> dict | None:
    """The nearest known place containing the point, or None."""
    if lat is None or lng is None or math.isnan(lat) or math.isnan(lng):
        return None
    best, best_d = None, float("inf")
    for place in places:
        d = haversine_m(lat, lng, place["lat"], place["lng"])
        polygon = place.get("polygon") or []
        inside = point_in_polygon(lat, lng, polygon) if len(polygon) >= 3 else d <= place.get("radius_m", PLANT_RADIUS_M)
        if inside and d < best_d:
            best, best_d = place, d
    return best


def _float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def plant_places(rows: list[dict]) -> list[dict]:
    out = []
    for row in rows:
        lat, lng = _float(row.get("Latitude")), _float(row.get("Longitude"))
        code = str(row.get("plant_code") or "").strip()
        if lat is None or lng is None or not code:
            continue
        name = f"{row.get('client') or ''} {code}".strip()
        out.append({"_id": f"plant:{code}", "kind": "plant", "code": code, "name": name,
                    "lat": lat, "lng": lng, "radius_m": PLANT_RADIUS_M, "polygon": []})
    return out


def besttech_places(rows: list[dict]) -> list[dict]:
    out = []
    for row in rows:
        lat, lng = _float(row.get("lat")), _float(row.get("lng"))
        code = str(row.get("code") or "").strip()
        if row.get("status", "A") != "A" or lat is None or lng is None or not code:
            continue
        polygon = [{"lat": float(p["lat"]), "lng": float(p["lng"])} for p in row.get("geofence") or []
                   if _float(p.get("lat")) is not None and _float(p.get("lng")) is not None]
        radius = _float(row.get("radius")) or 0.0
        out.append({"_id": f"besttech:{code}", "kind": "poi", "code": code, "name": row.get("name") or code,
                    "lat": lat, "lng": lng, "polygon": polygon if len(polygon) >= 3 else [],
                    "radius_m": radius if radius > 0 else PLANT_RADIUS_M})
    return out
```

In `scripts/fuel/besttech_client.py`, directly after the `history` method (one blank line between the two methods), add:
```python
    def location(self, since: str | None = None) -> list[dict]:
        """POI / geofence master of the organisation (`since` = YYYY-MM-DD to fetch only changes)."""
        payload = self._post("location", {"since_modified_date": since} if since else {})
        info = payload.get("info")
        return info if isinstance(info, list) else []
```

- [ ] **Step 5: Run them to verify they pass**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_fuel_settings.py scripts/fuel/tests/test_places.py scripts/fuel/tests/test_besttech_client.py -q`
Expected: `19 passed` (2 + 5 + 12).

- [ ] **Step 6: Commit**

```bash
git add scripts/fuel/fuel_settings.py scripts/fuel/places.py scripts/fuel/besttech_client.py scripts/fuel/tests/test_fuel_settings.py scripts/fuel/tests/test_places.py scripts/fuel/tests/test_besttech_client.py
git commit -m "feat(fuel): detection settings, known places, Besttech /location

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Detection core

**Files:**
- Create: `scripts/fuel/detect.py`
- Test: `scripts/fuel/tests/synth.py` (synthetic days, shared by later tests), `scripts/fuel/tests/test_detect.py`

**Interfaces:**
- Consumes: Part 1 `series_codec.decode_columns`, `fuel_to_litres`, `int_to_deg`; `series_build.Reading`, `build_series_doc`.
- Produces: dataclasses `DaySeries(plate, source, date_key, tank_l, status, valid_share, m, fuel, speed, engine, lat, lng)`, `Segment(parked, i0, i1)`, `Plateau(seg, start_level, end_level)`, `Context(clean, level, spikes, segments, gaps, plateaus)`, `Candidate(kind, where, i0, i1, before, after)` with `.litres`; functions `day_series(doc) -> DaySeries | None`, `hampel(...)`, `rolling_median(...)`, `segments(day, parked_kmh, gap_min)`, `plateaus(...)`, `prepare(day, settings) -> Context`, `gap_between(ctx, a, b) -> bool`, `find_candidates(day, ctx, settings) -> list[Candidate]`, `unexplained_rise(ctx, refuel_min, min_step=2.0) -> float`, `merge_candidates(...)`, `path_km_between(day, i0, i1) -> float`, `straight_km(day, i0, i1) -> float`. `synth`: `DAY, HOME, BASELINE, parked, driving, series, ramp, siphon_day, gap_day, refuel_day, slosh_day, noise_day, consumption_day, rates_day`.

- [ ] **Step 1: Write the test helper and the failing test**

`scripts/fuel/tests/synth.py`:
```python
"""Synthetic truck-days for the detection tests (one reading per minute, litres)."""
from datetime import date

from detect import day_series
from series_build import Reading, build_series_doc

DAY = date(2026, 10, 5)
HOME = (13.70, 100.50)
BASELINE = {"idle_lph": 3.0, "l_per_km": 0.4, "from": "truck"}


def parked(m0, m1, fuel, engine=0, pos=HOME):
    return [(m, fuel(m) if callable(fuel) else fuel, 0.0, engine, pos[0], pos[1]) for m in range(m0, m1)]


def driving(m0, m1, fuel, km_per_min=0.75, start=HOME, engine=1, speed=45.0):
    """Due north at km_per_min; returns the points and the final position."""
    pts = [(m, fuel(m) if callable(fuel) else fuel, speed, engine,
            start[0] + (m - m0) * km_per_min / 111.2, start[1]) for m in range(m0, m1)]
    return pts, (start[0] + (m1 - m0) * km_per_min / 111.2, start[1])


def series(points, unit="dl", tank=200.0, plate="สบ.71-0001", source="terminus"):
    readings = [Reading(sec=m * 60, fuel=f, speed=s, engine=e, lat=la, lng=lo) for m, f, s, e, la, lo in points]
    doc = build_series_doc(plate=plate, truck_code=None, day=DAY, source=source, unit=unit, tank_l=tank,
                           tank_from="default", readings=readings)
    return doc, day_series(doc)


def ramp(m0, m1, v0, v1):
    return lambda m: v0 + (v1 - v0) * (m - m0) / (m1 - m0)


def siphon_day():
    """Parked, engine off, all night; 30 L leave between 02:10 and 02:25 and never come back."""
    return parked(0, 130, 150.0) + parked(130, 145, ramp(130, 145, 150.0, 120.0)) + parked(145, 360, 120.0)


def gap_day():
    """Box silent 02:00–02:40; the level is 25 L lower when it comes back."""
    return parked(0, 120, 150.0) + parked(160, 300, 125.0)


def refuel_day():
    return parked(0, 60, 80.0, engine=1) + parked(60, 65, ramp(60, 65, 80.0, 160.0), engine=1) + parked(65, 240, 160.0)


def slosh_day():
    """Readings swing ±16 L (8 % of tank) while driving; parked levels only 3 L apart."""
    pts, pos = driving(30, 90, lambda m: 150.0 - 0.05 * (m - 30) + (16.0 if m % 2 else -16.0))
    return parked(0, 30, 150.0, engine=1) + pts + parked(90, 120, 147.0, engine=1, pos=pos)


def noise_day():
    """Parked dip of 20 L before a short drive; the next parked level (20 min later) is back at 149 L."""
    pts, pos = driving(80, 90, 130.0)
    return (parked(0, 60, 150.0) + parked(60, 70, ramp(60, 70, 150.0, 130.0)) + parked(70, 80, 130.0) + pts
            + parked(90, 180, 149.0, pos=pos))


def consumption_day():
    """30 km drive burning 12 L — exactly the 0.4 L/km baseline."""
    pts, pos = driving(30, 70, ramp(30, 70, 150.0, 138.0))
    return parked(0, 30, 150.0, engine=1) + pts + parked(70, 100, 138.0, engine=1, pos=pos)


def rates_day():
    """2 h idling burning 6 L (3 L/h), a 30 km drive burning 12 L (0.4 L/km), 1 h parked engine on."""
    pts, pos = driving(120, 160, ramp(120, 160, 144.0, 132.0))
    return parked(0, 120, ramp(0, 120, 150.0, 144.0), engine=1) + pts + parked(160, 220, 132.0, engine=1, pos=pos)
```

`scripts/fuel/tests/test_detect.py`:
```python
import numpy as np

from detect import find_candidates, hampel, prepare, rolling_median, segments, unexplained_rise
from fuel_settings import DEFAULTS
from synth import gap_day, noise_day, refuel_day, series, siphon_day, slosh_day


def test_hampel_removes_single_spike_only():
    m = np.arange(10)
    values = np.array([45.0, 45.1, 44.9, 45.0, 69.8, 45.0, 44.8, 45.0, 44.9, 45.1])
    clean, removed = hampel(m, values, 7, 3.0, 4.0)
    assert removed == 1 and np.isnan(clean[4]) and np.allclose(clean[[0, 5, 9]], values[[0, 5, 9]])


def test_rolling_median_ignores_missing():
    m = np.arange(5)
    out = rolling_median(m, np.array([1.0, np.nan, 3.0, 5.0, np.nan]), 3)
    assert out.tolist() == [1.0, 2.0, 4.0, 4.0, 5.0]


def test_segments_split_on_motion_and_gaps():
    _, day = series(gap_day())
    segs, gaps = segments(day, 5, 10)
    assert [(s.parked, int(day.m[s.i0]), int(day.m[s.i1])) for s in segs] == [(True, 0, 119), (True, 160, 299)]
    assert [(int(day.m[a]), int(day.m[b])) for a, b in gaps] == [(119, 160)]


def candidates(points):
    _, day = series(points)
    ctx = prepare(day, DEFAULTS)
    return day, ctx, find_candidates(day, ctx, DEFAULTS)


def test_siphon_is_one_parked_drop():
    day, _, found = candidates(siphon_day())
    assert len(found) == 1
    c = found[0]
    assert (c.kind, c.where) == ("drop", "parked") and c.litres == np.float64(30.0)
    assert 128 <= day.m[c.i0] <= 133 and 142 <= day.m[c.i1] <= 146


def test_gap_drop_is_a_gap_candidate():
    _, _, found = candidates(gap_day())
    assert [(c.kind, c.where, round(c.litres)) for c in found] == [("gap", "gap", 25)]


def test_refuel_is_a_rise():
    _, _, found = candidates(refuel_day())
    assert [(c.kind, round(c.litres)) for c in found] == [("refuel", 80)]


def test_slosh_while_driving_gives_nothing():
    _, _, found = candidates(slosh_day())
    assert found == []


def test_dip_then_back_is_found_and_rise_is_counted():
    _, ctx, found = candidates(noise_day())
    assert [(c.kind, c.where, round(c.litres)) for c in found] == [("drop", "parked", 20)]
    assert unexplained_rise(ctx, DEFAULTS["refuel_min_l"]) == np.float64(19.0)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_detect.py -q`
Expected: `ModuleNotFoundError: No module named 'detect'`.

- [ ] **Step 3: Implement `scripts/fuel/detect.py`**

```python
"""Candidate fuel events in one truck-day of gps_series (spec §4.1) — pure functions, no I/O.

Steps: decode → litres → Hampel spike filter → 5-min rolling-median level → split the day into
parked / moving segments (a gap longer than gap_min also splits) → trusted levels only from parked
stretches of at least plateau_min minutes → candidates:
  drop   level falls ≥ min_drop_l inside a parked stretch, or between two parked stretches
  refuel level rises ≥ refuel_min_l, same places
  gap    the box is silent ≥ gap_min and the level is ≥ min_drop_l lower afterwards
The thresholds are raw litres on purpose (sensitive); scoring later compares each candidate
with the truck's expected burn.
"""
from dataclasses import dataclass

import numpy as np

from series_codec import decode_columns, fuel_to_litres, int_to_deg

EARTH_RADIUS_KM = 6371.0


@dataclass
class DaySeries:
    plate: str
    source: str
    date_key: str
    tank_l: float
    status: str           # coverage status from Part 1
    valid_share: float    # coverage.fuel_valid_share
    m: np.ndarray         # minute of day
    fuel: np.ndarray      # litres, NaN = no valid reading
    speed: np.ndarray
    engine: np.ndarray
    lat: np.ndarray       # degrees, NaN = no position
    lng: np.ndarray


@dataclass
class Segment:
    parked: bool
    i0: int               # first index (inclusive)
    i1: int               # last index (inclusive)


@dataclass
class Plateau:
    seg: Segment
    start_level: float
    end_level: float


@dataclass
class Context:
    clean: np.ndarray     # fuel after the spike filter (litres)
    level: np.ndarray     # rolling-median level (litres)
    spikes: int
    segments: list
    gaps: list            # (index before, index after)
    plateaus: list


@dataclass
class Candidate:
    kind: str             # drop | refuel | gap
    where: str            # parked | moving | gap
    i0: int               # index just before the change
    i1: int               # index where the change is complete
    before: float         # level before (litres)
    after: float          # level after (litres)

    @property
    def litres(self) -> float:
        return abs(self.after - self.before)


def day_series(doc: dict) -> DaySeries | None:
    """gps_series document → DaySeries (None when the day has no readings)."""
    if not doc.get("n"):
        return None
    cols = decode_columns(doc["cols"], doc["n"])
    lat, lng = int_to_deg(cols["lat"]), int_to_deg(cols["lng"])
    no_pos = (cols["lat"] == 0) | (cols["lng"] == 0)
    lat[no_pos] = np.nan
    lng[no_pos] = np.nan
    cov = doc.get("coverage") or {}
    return DaySeries(plate=doc["plate"], source=doc["source"], date_key=doc["date_key"],
                     tank_l=float(doc["tank_l"]), status=cov.get("status", "ok"),
                     valid_share=float(cov.get("fuel_valid_share", 0.0)),
                     m=cols["m"].astype(int), fuel=fuel_to_litres(cols["fuel"], doc["fuel_unit"], doc["tank_l"]),
                     speed=cols["speed"].astype(float), engine=cols["engine"].astype(int), lat=lat, lng=lng)


def _windows(m_valid: np.ndarray, half: float) -> tuple[np.ndarray, np.ndarray]:
    return (np.searchsorted(m_valid, m_valid - half, side="left"),
            np.searchsorted(m_valid, m_valid + half, side="right"))


def hampel(m: np.ndarray, values: np.ndarray, window_min: int, k: float, min_dev: float) -> tuple[np.ndarray, int]:
    """Replace single-reading spikes with NaN; returns (cleaned, number removed)."""
    out = values.copy()
    idx = np.flatnonzero(~np.isnan(values))
    if idx.size < 3:
        return out, 0
    vm, vv = m[idx], values[idx]
    lo, hi = _windows(vm, window_min // 2)
    removed = 0
    for i in range(idx.size):
        window = vv[lo[i]:hi[i]]
        med = float(np.median(window))
        mad = 1.4826 * float(np.median(np.abs(window - med)))
        if abs(vv[i] - med) > max(k * mad, min_dev):
            out[idx[i]] = np.nan
            removed += 1
    return out, removed


def rolling_median(m: np.ndarray, values: np.ndarray, window_min: int) -> np.ndarray:
    """Centred time-based rolling median over valid values (NaN where the window is empty)."""
    out = np.full(values.shape, np.nan)
    idx = np.flatnonzero(~np.isnan(values))
    if idx.size == 0:
        return out
    vm, vv = m[idx], values[idx]
    lo = np.searchsorted(vm, m - window_min // 2, side="left")
    hi = np.searchsorted(vm, m + window_min // 2, side="right")
    for i in range(m.size):
        if hi[i] > lo[i]:
            out[i] = float(np.median(vv[lo[i]:hi[i]]))
    return out


def segments(day: DaySeries, parked_kmh: float, gap_min: int) -> tuple[list[Segment], list[tuple[int, int]]]:
    """Split the day into parked / moving runs; a silence longer than gap_min also splits.
    Returns (segments, gaps) where a gap is (index before, index after)."""
    segs: list[Segment] = []
    gaps: list[tuple[int, int]] = []
    if day.m.size == 0:
        return segs, gaps
    parked = day.speed <= parked_kmh
    start = 0
    for i in range(1, day.m.size):
        gap = day.m[i] - day.m[i - 1] > gap_min
        if gap or parked[i] != parked[start]:
            segs.append(Segment(bool(parked[start]), start, i - 1))
            if gap:
                gaps.append((i - 1, i))
            start = i
    segs.append(Segment(bool(parked[start]), start, day.m.size - 1))
    return segs, gaps


def _edge_level(day: DaySeries, level: np.ndarray, seg: Segment, minutes: int, at_start: bool) -> float:
    if at_start:
        sel = (day.m >= day.m[seg.i0]) & (day.m < day.m[seg.i0] + minutes)
    else:
        sel = (day.m <= day.m[seg.i1]) & (day.m > day.m[seg.i1] - minutes)
    sel[: seg.i0] = False
    sel[seg.i1 + 1:] = False
    values = level[sel]
    values = values[~np.isnan(values)]
    return float(np.median(values)) if values.size else float("nan")


def plateaus(day: DaySeries, level: np.ndarray, segs: list[Segment], plateau_min: int) -> list[Plateau]:
    out = []
    for seg in segs:
        if not seg.parked or day.m[seg.i1] - day.m[seg.i0] + 1 < plateau_min:
            continue
        start = _edge_level(day, level, seg, plateau_min, True)
        end = _edge_level(day, level, seg, plateau_min, False)
        if not (np.isnan(start) or np.isnan(end)):
            out.append(Plateau(seg, start, end))
    return out


def _change_bounds(level: np.ndarray, seg: Segment, before: float, after: float) -> tuple[int, int]:
    """Indices bracketing a change inside a segment: last point still near `before` and first point near `after`."""
    tol = 0.1 * abs(after - before)
    falling = after < before
    i0, i1 = seg.i0, seg.i1
    for i in range(seg.i0, seg.i1 + 1):
        v = level[i]
        if np.isnan(v):
            continue
        if (v >= before - tol) if falling else (v <= before + tol):
            i0 = i
        else:
            break
    for i in range(i0, seg.i1 + 1):
        v = level[i]
        if not np.isnan(v) and ((v <= after + tol) if falling else (v >= after - tol)):
            i1 = i
            break
    return i0, max(i1, i0)


def _gap_level(day: DaySeries, level: np.ndarray, index: int, minutes: int, before: bool) -> float:
    if before:
        sel = (day.m <= day.m[index]) & (day.m > day.m[index] - minutes)
        sel[index + 1:] = False
    else:
        sel = (day.m >= day.m[index]) & (day.m < day.m[index] + minutes)
        sel[:index] = False
    values = level[sel]
    values = values[~np.isnan(values)]
    return float(np.median(values)) if values.size else float("nan")


def prepare(day: DaySeries, settings: dict) -> Context:
    min_dev = max(settings["spike_min_l"], settings["spike_min_pct"] / 100 * day.tank_l)
    clean, spikes = hampel(day.m, day.fuel, settings["hampel_window_min"], settings["hampel_k"], min_dev)
    level = rolling_median(day.m, clean, settings["plateau_min"])
    segs, gaps = segments(day, settings["parked_kmh"], settings["gap_min"])
    return Context(clean, level, spikes, segs, gaps, plateaus(day, level, segs, settings["plateau_min"]))


def gap_between(ctx: Context, a: Plateau, b: Plateau) -> bool:
    return any(a.seg.i1 < after <= b.seg.i0 for _, after in ctx.gaps)


def find_candidates(day: DaySeries, ctx: Context, settings: dict) -> list[Candidate]:
    """All candidate events of the day, merged (same kind, closer than merge_min)."""
    min_drop, min_rise = settings["min_drop_l"], settings["refuel_min_l"]
    found: list[Candidate] = []

    def add(kind_if_drop: str, where: str, i0: int, i1: int, before: float, after: float) -> None:
        delta = after - before
        if delta <= -min_drop:
            found.append(Candidate(kind_if_drop, where, i0, i1, before, after))
        elif delta >= min_rise:
            found.append(Candidate("refuel", where, i0, i1, before, after))

    for p in ctx.plateaus:   # inside one parked stretch
        if abs(p.end_level - p.start_level) >= min(min_drop, min_rise):
            i0, i1 = _change_bounds(ctx.level, p.seg, p.start_level, p.end_level)
            add("drop", "parked", i0, i1, p.start_level, p.end_level)
    for a, b in zip(ctx.plateaus, ctx.plateaus[1:]):   # between two parked stretches, no gap between
        if not gap_between(ctx, a, b):
            add("drop", "moving", a.seg.i1, b.seg.i0, a.end_level, b.start_level)
    for i_before, i_after in ctx.gaps:
        before = _gap_level(day, ctx.level, i_before, settings["plateau_min"], True)
        after = _gap_level(day, ctx.level, i_after, settings["plateau_min"], False)
        if not (np.isnan(before) or np.isnan(after)):
            add("gap", "gap", i_before, i_after, before, after)
    return merge_candidates(day, found, settings["merge_min"])


def unexplained_rise(ctx: Context, refuel_min: float, min_step: float = 2.0) -> float:
    """Litres the level rose without a refuel during the day (between and inside parked stretches) —
    a sensor that climbs back by itself makes drops of the same size untrustworthy."""
    levels = []
    for p in ctx.plateaus:
        levels += [p.start_level, p.end_level]
    steps = np.diff(np.array(levels)) if len(levels) > 1 else np.array([])
    rises = steps[(steps >= min_step) & (steps < refuel_min)]
    return float(rises.sum())


def merge_candidates(day: DaySeries, found: list[Candidate], merge_min: int) -> list[Candidate]:
    out: list[Candidate] = []
    for c in sorted(found, key=lambda c: (day.m[c.i0], day.m[c.i1])):
        last = out[-1] if out else None
        if last and last.kind == c.kind and day.m[c.i0] - day.m[last.i1] < merge_min:
            out[-1] = Candidate(last.kind, last.where, last.i0, max(last.i1, c.i1), last.before, c.after)
        else:
            out.append(c)
    return out


def path_km_between(day: DaySeries, i0: int, i1: int) -> float:
    """Distance driven between two indices (haversine over consecutive positions, jumps > 5 km ignored)."""
    lat = np.radians(day.lat[i0:i1 + 1])
    lng = np.radians(day.lng[i0:i1 + 1])
    ok = ~(np.isnan(lat) | np.isnan(lng))
    lat, lng = lat[ok], lng[ok]
    if lat.size < 2:
        return 0.0
    a = np.sin(np.diff(lat) / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(np.diff(lng) / 2) ** 2
    steps = 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    return float(steps[steps <= 5.0].sum())


def straight_km(day: DaySeries, i0: int, i1: int) -> float:
    if np.isnan(day.lat[i0]) or np.isnan(day.lat[i1]):
        return 0.0
    la0, lo0, la1, lo1 = map(np.radians, (day.lat[i0], day.lng[i0], day.lat[i1], day.lng[i1]))
    a = np.sin((la1 - la0) / 2) ** 2 + np.cos(la0) * np.cos(la1) * np.sin((lo1 - lo0) / 2) ** 2
    return float(2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(min(max(a, 0.0), 1.0))))
```

- [ ] **Step 4: Run it to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_detect.py -q`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/detect.py scripts/fuel/tests/synth.py scripts/fuel/tests/test_detect.py
git commit -m "feat(fuel): candidate detection — spike filter, parked levels, drops, refuels, gaps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Expected-burn baselines

**Files:**
- Create: `scripts/fuel/baseline.py`
- Test: `scripts/fuel/tests/test_baseline.py`

**Interfaces:**
- Consumes: Task 2 `Context`, `DaySeries`, `gap_between`, `path_km_between`.
- Produces: `day_rates(day, ctx) -> {"idle_rates": list[float], "km_rates": list[float]}` (plain floats), `fleet_baseline(stats) -> {"idle_lph", "l_per_km"}`, `truck_baseline(stats, fleet, min_days) -> {"idle_lph", "l_per_km", "from": "truck" | "fleet"}`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_baseline.py`:
```python
import pytest

from baseline import day_rates, fleet_baseline, truck_baseline
from detect import prepare
from fuel_settings import DEFAULTS
from synth import rates_day, series


def test_day_rates_idle_and_per_km():
    _, day = series(rates_day())
    rates = day_rates(day, prepare(day, DEFAULTS))
    assert rates["idle_rates"][0] == pytest.approx(3.0, abs=0.2)     # 6 L over 2 h idling
    assert rates["idle_rates"][1] == pytest.approx(0.0, abs=0.1)     # 1 h idling, level flat
    assert rates["km_rates"] == [pytest.approx(0.4, abs=0.02)]       # 12 L over 30 km
    assert all(type(r) is float for r in rates["idle_rates"] + rates["km_rates"])


def test_fleet_and_truck_baselines():
    stats = [{"idle_rates": [2.0, 4.0], "km_rates": [0.5]}, {"idle_rates": [3.0], "km_rates": []}]
    fleet = fleet_baseline(stats)
    assert fleet == {"idle_lph": 3.0, "l_per_km": 0.5}
    own = [{"idle_rates": [1.0], "km_rates": [0.2]}] * 7
    assert truck_baseline(own, fleet, 7) == {"idle_lph": 1.0, "l_per_km": 0.2, "from": "truck"}
    assert truck_baseline(own[:3], fleet, 7) == {"idle_lph": 3.0, "l_per_km": 0.5, "from": "fleet"}
    assert truck_baseline([], {"idle_lph": None, "l_per_km": None}, 7) == {"idle_lph": 0.0, "l_per_km": 0.0, "from": "fleet"}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_baseline.py -q`
Expected: `ModuleNotFoundError: No module named 'baseline'`.

- [ ] **Step 3: Implement `scripts/fuel/baseline.py`**

```python
"""Expected burn per truck (spec §4.1) — pure functions.

Each truck-day gives raw rate observations (no event filtering — medians shrug off the rare theft):
  idle_rates  litres per engine-on hour on parked stretches ≥ 60 min with the engine on ≥ 80 % of the time
  km_rates    litres per km between two parked levels at least 5 km apart (no data gap between)
A truck's baseline is the median of its observations over the last `baseline_days`; with fewer than
`baseline_min_days` days of observations the fleet median is used instead.
"""
import numpy as np

from detect import Context, DaySeries, gap_between, path_km_between

MIN_IDLE_MIN = 60
MIN_IDLE_ON_SHARE = 0.8
MIN_KM = 5.0


def day_rates(day: DaySeries, ctx: Context) -> dict:
    idle, per_km = [], []
    for p in ctx.plateaus:
        minutes = day.m[p.seg.i1] - day.m[p.seg.i0] + 1
        on_share = float(day.engine[p.seg.i0:p.seg.i1 + 1].mean())
        if minutes >= MIN_IDLE_MIN and on_share >= MIN_IDLE_ON_SHARE:
            idle.append(float(max(0.0, p.start_level - p.end_level) / (minutes * on_share / 60)))
    for a, b in zip(ctx.plateaus, ctx.plateaus[1:]):
        if gap_between(ctx, a, b):
            continue
        km = path_km_between(day, a.seg.i1, b.seg.i0)
        if km >= MIN_KM:
            per_km.append(float(max(0.0, a.end_level - b.start_level) / km))
    return {"idle_rates": [round(r, 3) for r in idle], "km_rates": [round(r, 4) for r in per_km]}


def _median(values: list[float]) -> float | None:
    return float(np.median(values)) if values else None


def fleet_baseline(stats: list[dict]) -> dict:
    """Median over every observation of every truck (stats = fuel_day_stats documents)."""
    return {"idle_lph": _median([r for s in stats for r in s.get("idle_rates", [])]),
            "l_per_km": _median([r for s in stats for r in s.get("km_rates", [])])}


def truck_baseline(stats: list[dict], fleet: dict, min_days: int) -> dict:
    """stats = this truck's fuel_day_stats documents in the window."""
    idle_days = [s for s in stats if s.get("idle_rates")]
    km_days = [s for s in stats if s.get("km_rates")]
    idle = _median([r for s in idle_days for r in s["idle_rates"]]) if len(idle_days) >= min_days else None
    per_km = _median([r for s in km_days for r in s["km_rates"]]) if len(km_days) >= min_days else None
    return {"idle_lph": idle if idle is not None else fleet.get("idle_lph") or 0.0,
            "l_per_km": per_km if per_km is not None else fleet.get("l_per_km") or 0.0,
            "from": "truck" if idle is not None and per_km is not None else "fleet"}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_baseline.py -q`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/baseline.py scripts/fuel/tests/test_baseline.py
git commit -m "feat(fuel): per-truck idle and per-km burn baselines with fleet fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Evidence per candidate

**Files:**
- Create: `scripts/fuel/features.py`
- Test: `scripts/fuel/tests/test_features.py`

**Interfaces:**
- Consumes: Task 1 `find_place`; Task 2 `Candidate`, `Context`, `DaySeries`, `path_km_between`, `straight_km`, `unexplained_rise`.
- Produces: `minute_weights(day, gap_min)`, `sensor_noise_pct(day, ctx, parked_kmh) -> float`, `day_evidence(day, ctx, settings) -> {sensor_noise_parked, day_rise_l, spikes_removed}`, `expected_burn(day, c, baseline, weights, parked_kmh) -> float`, `evidence(day, ctx, c, baseline, settings, places, day_ev) -> dict` with keys `kind, where, litres, pct_tank, duration_min, rate_l_per_min, expected_burn_l, excess_over_burn_l, level_before, level_after, recovered_10/30/60/120, rebound_60, stays_up_30/60 (refuel only), engine_off_share, moving_share, gap_min, at_place, place_name, lat, lng, night, source, start_min, end_min, sensor_noise_parked, day_rise_l, spikes_removed`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_features.py`:
```python
import pytest

from detect import find_candidates, prepare
from features import day_evidence, evidence
from fuel_settings import DEFAULTS
from synth import BASELINE, HOME, consumption_day, gap_day, noise_day, refuel_day, series, siphon_day

PLACE = {"name": "ACON A109", "lat": HOME[0], "lng": HOME[1], "radius_m": 300.0, "polygon": []}


def first_evidence(points, places=()):
    _, day = series(points)
    ctx = prepare(day, DEFAULTS)
    c = find_candidates(day, ctx, DEFAULTS)[0]
    return evidence(day, ctx, c, BASELINE, DEFAULTS, list(places), day_evidence(day, ctx, DEFAULTS))


def test_siphon_evidence():
    ev = first_evidence(siphon_day())
    assert ev["kind"] == "drop" and ev["litres"] == 30.0 and ev["pct_tank"] == 15.0
    assert ev["expected_burn_l"] == 0.0 and ev["excess_over_burn_l"] == 30.0     # engine off: nothing burns
    assert ev["engine_off_share"] == 1.0 and ev["moving_share"] == 0.0 and ev["night"]
    assert not ev["recovered_120"] and not ev["rebound_60"] and ev["rate_l_per_min"] >= 1
    assert ev["at_place"] is False and ev["day_rise_l"] == 0.0 and ev["source"] == "terminus"


def test_place_is_found():
    ev = first_evidence(siphon_day(), [PLACE])
    assert ev["at_place"] and ev["place_name"] == "ACON A109"


def test_noise_dip_recovers():
    ev = first_evidence(noise_day())
    assert ev["recovered_30"] and not ev["recovered_10"] and ev["day_rise_l"] == 19.0


def test_gap_evidence():
    ev = first_evidence(gap_day())
    assert ev["kind"] == "gap" and ev["gap_min"] == 41 and ev["excess_over_burn_l"] == 25.0


def test_refuel_stays_up():
    ev = first_evidence(refuel_day())
    assert ev["kind"] == "refuel" and ev["stays_up_30"] and ev["stays_up_60"] and not ev["recovered_30"]


def test_consumption_matches_expected_burn():
    ev = first_evidence(consumption_day())
    assert ev["where"] == "moving" and ev["expected_burn_l"] == pytest.approx(12.0, abs=0.6)
    assert abs(ev["excess_over_burn_l"]) <= 0.6
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_features.py -q`
Expected: `ModuleNotFoundError: No module named 'features'`.

- [ ] **Step 3: Implement `scripts/fuel/features.py`**

```python
"""Evidence for each candidate (spec §4.3) — pure functions.

Day-level evidence (computed once per truck-day): sensor_noise_parked and day_rise_l.
Per-candidate evidence: size, speed, excess over the truck's expected burn, whether the level came
back (fully: recovered_*, half-way: rebound_60), engine/motion during the change, data gaps, place,
night. both_boxes and the 30-day history counts are filled in later by events.py.
"""
import numpy as np

from detect import Candidate, Context, DaySeries, path_km_between, straight_km, unexplained_rise
from places import find_place

NIGHT_FROM, NIGHT_TO = 18 * 60, 6 * 60
RECOVERY_WINDOWS = (10, 30, 60, 120)


def minute_weights(day: DaySeries, gap_min: int) -> np.ndarray:
    """Minutes each bucket stands for (time to the next bucket, capped at gap_min) — Besttech sends a
    point only every ~3 min when parked, so counting buckets would under-count parked time."""
    if day.m.size == 0:
        return np.zeros(0)
    w = np.minimum(np.diff(day.m, append=day.m[-1] + 1), gap_min).astype(float)
    return w


def sensor_noise_pct(day: DaySeries, ctx: Context, parked_kmh: float) -> float:
    """p90 of |reading − rolling level| on parked minutes, % of tank (works for 1 reading/min too)."""
    ok = (day.speed <= parked_kmh) & ~np.isnan(ctx.clean) & ~np.isnan(ctx.level)
    if ok.sum() < 10:
        return 0.0
    return float(np.percentile(np.abs(ctx.clean[ok] - ctx.level[ok]), 90)) / day.tank_l * 100


def day_evidence(day: DaySeries, ctx: Context, settings: dict) -> dict:
    return {"sensor_noise_parked": round(sensor_noise_pct(day, ctx, settings["parked_kmh"]), 2),
            "day_rise_l": round(unexplained_rise(ctx, settings["refuel_min_l"]), 1),
            "spikes_removed": ctx.spikes}


def _parked_levels_after(day: DaySeries, ctx: Context, index: int, minutes: int, parked_kmh: float) -> np.ndarray:
    sel = (day.m > day.m[index]) & (day.m <= day.m[index] + minutes) & (day.speed <= parked_kmh)
    values = ctx.level[sel]
    return values[~np.isnan(values)]


def _position(day: DaySeries, index: int) -> tuple[float | None, float | None]:
    ok = np.flatnonzero(~np.isnan(day.lat))
    if ok.size == 0:
        return None, None
    j = ok[np.argmin(np.abs(ok - index))]
    return float(day.lat[j]), float(day.lng[j])


def expected_burn(day: DaySeries, c: Candidate, baseline: dict, weights: np.ndarray, parked_kmh: float) -> float:
    sl = slice(c.i0, c.i1)
    parked_on = (day.speed[sl] <= parked_kmh) & (day.engine[sl] == 1)
    hours = float(weights[sl][parked_on].sum()) / 60
    km = straight_km(day, c.i0, c.i1) if c.where == "gap" else path_km_between(day, c.i0, c.i1)
    return baseline["idle_lph"] * hours + baseline["l_per_km"] * km


def evidence(day: DaySeries, ctx: Context, c: Candidate, baseline: dict, settings: dict,
             places: list[dict], day_ev: dict) -> dict:
    parked_kmh = settings["parked_kmh"]
    tol = max(settings["recover_tol_l"], settings["recover_tol_pct"] / 100 * day.tank_l)
    weights = minute_weights(day, settings["gap_min"])
    litres = c.litres
    duration = max(1, int(day.m[c.i1] - day.m[c.i0]))
    burn = expected_burn(day, c, baseline, weights, parked_kmh)
    ev = {"kind": c.kind, "where": c.where, "litres": round(litres, 1),
          "pct_tank": round(litres / day.tank_l * 100, 1), "duration_min": duration,
          "rate_l_per_min": round(litres / duration, 2), "expected_burn_l": round(burn, 1),
          "excess_over_burn_l": round(litres - burn if c.kind != "refuel" else litres, 1),
          "level_before": round(c.before, 1), "level_after": round(c.after, 1)}
    if c.kind == "refuel":
        for n in RECOVERY_WINDOWS:
            ev[f"recovered_{n}"] = False
        ev["rebound_60"] = False
        for n in (30, 60):
            after = _parked_levels_after(day, ctx, c.i1, n, parked_kmh)
            ev[f"stays_up_{n}"] = bool(after.size and after.min() >= c.after - tol)
    else:
        for n in RECOVERY_WINDOWS:
            after = _parked_levels_after(day, ctx, c.i1, n, parked_kmh)
            ev[f"recovered_{n}"] = bool(after.size and after.max() >= c.before - tol)
        after = _parked_levels_after(day, ctx, c.i1, 60, parked_kmh)
        ev["rebound_60"] = bool(after.size and after.max() >= c.after + 0.5 * litres)
    window = slice(c.i0, c.i1 + 1)
    w = weights[window]
    total = float(w.sum()) or 1.0
    ev["engine_off_share"] = round(float(w[day.engine[window] == 0].sum()) / total, 2)
    ev["moving_share"] = round(float(w[day.speed[window] > parked_kmh].sum()) / total, 2)
    ev["gap_min"] = int(np.diff(day.m[window]).max()) if c.i1 > c.i0 else 0
    lat, lng = _position(day, c.i0)
    place = find_place(lat, lng, places)
    ev["at_place"] = place is not None
    ev["place_name"] = place["name"] if place else None
    ev["lat"], ev["lng"] = lat, lng
    start = int(day.m[c.i0])
    ev["night"] = start >= NIGHT_FROM or start < NIGHT_TO
    ev["source"] = day.source
    ev["start_min"], ev["end_min"] = start, int(day.m[c.i1])
    ev.update(day_ev)
    return ev
```

- [ ] **Step 4: Run it to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_features.py -q`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/features.py scripts/fuel/tests/test_features.py
git commit -m "feat(fuel): evidence per candidate (burn excess, recovery, engine, place, night, sensor noise)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rules v1 and the real-data fixtures

**Files:**
- Create: `scripts/fuel/rules.py`
- Create: `scripts/fuel/tests/data/besttech_ME152_2026-10-05.json`, `scripts/fuel/tests/data/besttech_ME081_2026-10-05.json` (real points, ~160 KB together)
- Test: `scripts/fuel/tests/test_rules.py`, `scripts/fuel/tests/test_fixtures_besttech.py`

**Interfaces:**
- Consumes: Task 4 evidence dicts.
- Produces: `LOSS_CLASSES`, `SUGGESTION`, `SCORER_V1 = "rules-v1"`, `RULE_CONF_CLEAR`, `RULE_CONF_OTHER`, `NOISE_RISE_FACTOR`, `ACTION_CHECK/GAP/SENSOR/ESCALATE`, `classify(ev, settings, day_status) -> str`, `score_v1(cls, ev, settings) -> int`, `is_clear(cls, ev, settings) -> bool`, `phrases(ev) -> dict[str, str]`, `rule_reasons(cls, ev) -> list[str]`, `action_for(cls, ev, repeat) -> str | None`.

- [ ] **Step 1: Put the fixture files in place**

The dry-run left them in this session's scratchpad; copy them:
```bash
mkdir -p scripts/fuel/tests/data
cp /private/tmp/claude-501/-Users-menatransport-02-Documents-cluade-workspace/5508f77c-bc79-4803-80fa-686d2a085c41/scratchpad/lane2/scripts/fuel/tests/data/besttech_ME152_2026-10-05.json /private/tmp/claude-501/-Users-menatransport-02-Documents-cluade-workspace/5508f77c-bc79-4803-80fa-686d2a085c41/scratchpad/lane2/scripts/fuel/tests/data/besttech_ME081_2026-10-05.json scripts/fuel/tests/data/
ls -l scripts/fuel/tests/data
```
If that folder is gone, rebuild them from the probe responses (same session scratchpad):
```bash
python3 - /private/tmp/claude-501/-Users-menatransport-02-Documents-cluade-workspace/5508f77c-bc79-4803-80fa-686d2a085c41/scratchpad/besttech_probe_out scripts/fuel/tests/data <<'EOF'
import json, sys, pathlib
probe, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
for code, plate in [("ME152", "ME152 (71-8635 สบ.)"), ("ME081", "ME081 (71-7463 สบ.)")]:
    pts = json.load(open(probe / f"2_history_yday_{code}.json"))["info"]["points"]
    rows = [[p["gps_time"][11:], p.get("fuel_percentage"), p.get("speed"), 1 if str(p.get("engine")).upper() == "ON" else 0,
             p.get("lat"), p.get("lng")] for p in pts if p.get("gps_time", "").startswith("2026-10-05")]
    (out / f"besttech_{code}_2026-10-05.json").write_text(json.dumps(
        {"vehicle_no": plate, "day": "2026-10-05", "fields": ["time", "fuel_pct", "speed", "engine", "lat", "lng"],
         "points": rows}, ensure_ascii=False, separators=(",", ":")))
EOF
```
If the probe files are gone too: **⚠️ PROD (Besttech, 2 calls)** — ask the user, then fetch the same two days with `BesttechClient.history("ME152 (71-8635 สบ.)", 2026-10-05 00:00:00, 23:59:59)` and `"ME081 (71-7463 สบ.)"` and write them in the format above. Expected: 2,381 and 1,435 points.

- [ ] **Step 2: Write the failing tests**

`scripts/fuel/tests/test_rules.py`:
```python
from fuel_settings import DEFAULTS
from rules import ACTION_CHECK, ACTION_ESCALATE, ACTION_GAP, ACTION_SENSOR, action_for, classify, is_clear, rule_reasons, score_v1


def ev(**overrides):
    base = {"kind": "drop", "where": "parked", "litres": 30.0, "pct_tank": 15.0, "duration_min": 15,
            "rate_l_per_min": 2.0, "expected_burn_l": 0.0, "excess_over_burn_l": 30.0,
            "recovered_10": False, "recovered_30": False, "recovered_60": False, "recovered_120": False,
            "rebound_60": False, "engine_off_share": 1.0, "moving_share": 0.0, "gap_min": 1,
            "at_place": False, "place_name": None, "night": True, "both_boxes": False,
            "sensor_noise_parked": 0.5, "day_rise_l": 0.0, "source": "terminus"}
    return {**base, **overrides}


def test_classes():
    assert classify(ev(), DEFAULTS, "ok") == "suspected_loss"
    assert classify(ev(kind="gap", where="gap", gap_min=40), DEFAULTS, "ok") == "gap_loss"
    assert classify(ev(), DEFAULTS, "stuck") == "sensor_fault"
    assert classify(ev(sensor_noise_parked=12.0), DEFAULTS, "ok") == "sensor_fault"
    assert classify(ev(recovered_30=True), DEFAULTS, "ok") == "noise"
    assert classify(ev(rebound_60=True), DEFAULTS, "ok") == "noise"
    assert classify(ev(day_rise_l=25.0), DEFAULTS, "ok") == "noise"           # 30 ≤ 1.5 × 25
    assert classify(ev(excess_over_burn_l=4.0), DEFAULTS, "ok") == "consumption"
    assert classify(ev(recovered_60=True), DEFAULTS, "ok") == "noise"
    assert classify(ev(kind="refuel", stays_up_30=True), DEFAULTS, "ok") == "refuel"
    assert classify(ev(kind="refuel", stays_up_30=False), DEFAULTS, "ok") == "noise"


def test_score_v1():
    assert score_v1("suspected_loss", ev(), DEFAULTS) == 100      # 50+15+10+10+10+10, capped
    assert score_v1("suspected_loss", ev(engine_off_share=0.2, night=False, at_place=True, recovered_120=True,
                                         rate_l_per_min=0.5, sensor_noise_parked=4.0), DEFAULTS) == 30
    assert score_v1("consumption", ev(), DEFAULTS) == 0


def test_clear_cases():
    assert is_clear("noise", ev(recovered_10=True), DEFAULTS)
    assert not is_clear("noise", ev(recovered_30=True), DEFAULTS)
    assert is_clear("consumption", ev(excess_over_burn_l=1.5), DEFAULTS)
    assert not is_clear("consumption", ev(excess_over_burn_l=4.0), DEFAULTS)
    assert is_clear("refuel", ev(kind="refuel", stays_up_60=True), DEFAULTS)
    assert not is_clear("suspected_loss", ev(), DEFAULTS)


def test_reasons_and_actions_in_thai():
    assert rule_reasons("suspected_loss", ev()) == ["จอดดับเครื่อง", "ระดับไม่กลับขึ้นหลัง 2 ชม.", "ไม่ได้อยู่ในแพลนท์/อู่"]
    assert rule_reasons("gap_loss", ev(kind="gap", gap_min=40))[0] == "กล่อง GPS ขาดสัญญาณ 40 นาที"
    assert rule_reasons("noise", ev(recovered_30=True))[0] == "ระดับกลับขึ้นภายใน 30 นาที"
    assert action_for("suspected_loss", ev(), repeat=False) == ACTION_CHECK
    assert action_for("gap_loss", ev(), repeat=True) == f"{ACTION_GAP} + {ACTION_ESCALATE}"
    assert action_for("sensor_fault", ev(), repeat=True) == ACTION_SENSOR
    assert action_for("noise", ev(), repeat=True) is None
```

`scripts/fuel/tests/test_fixtures_besttech.py`:
```python
"""Two real Besttech truck-days (2026-10-05) — spec §7: noisy sensors must not raise loss events."""
import json
from datetime import date
from pathlib import Path

import pytest

from baseline import day_rates, fleet_baseline, truck_baseline
from detect import day_series, find_candidates, prepare
from features import day_evidence, evidence
from fuel_settings import DEFAULTS
from rules import LOSS_CLASSES, classify
from series_besttech import besttech_day_docs

DATA = Path(__file__).parent / "data"
FIELDS = ["gps_time", "fuel_percentage", "speed", "engine", "lat", "lng"]


def load(code):
    fixture = json.loads((DATA / f"besttech_{code}_2026-10-05.json").read_text())
    points = [dict(zip(FIELDS, [f"2026-10-05 {t}", fuel, speed, "ON" if engine else "OFF", lat, lng]))
              for t, fuel, speed, engine, lat, lng in fixture["points"]]
    doc = besttech_day_docs(date(2026, 10, 5), [], [[{"vehicle_no": fixture["vehicle_no"], "points": points}]], {})[0]
    return day_series(doc)


@pytest.mark.parametrize("code", ["ME152", "ME081"])
def test_noisy_real_day_has_no_loss_event(code):
    day = load(code)
    ctx = prepare(day, DEFAULTS)
    base = truck_baseline([day_rates(day, ctx)], fleet_baseline([day_rates(day, ctx)]), 1)
    day_ev = day_evidence(day, ctx, DEFAULTS)
    found = find_candidates(day, ctx, DEFAULTS)
    assert found, "the noisy sensor should still produce candidates to classify"
    classes = [classify(evidence(day, ctx, c, base, DEFAULTS, [], day_ev), DEFAULTS, day.status) for c in found]
    assert not set(classes) & set(LOSS_CLASSES)


def test_me152_spikes_are_removed():
    day = load("ME152")
    assert prepare(day, DEFAULTS).spikes >= 1      # 16:21:58 reads 69.8 % between 44–45 % readings
```

- [ ] **Step 3: Run them to verify they fail**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_rules.py scripts/fuel/tests/test_fixtures_besttech.py -q`
Expected: `ModuleNotFoundError: No module named 'rules'`.

- [ ] **Step 4: Implement `scripts/fuel/rules.py`**

```python
"""Rules v1 (spec §4.2, §4.4): class, score, clear flag, suggestion, reasons and action in Thai."""

LOSS_CLASSES = ("suspected_loss", "gap_loss")
SUGGESTION = {"suspected_loss": "real_loss", "gap_loss": "real_loss", "noise": "noise",
              "sensor_fault": "noise", "consumption": "legit", "refuel": "legit"}
SCORER_V1 = "rules-v1"
# v1 has no probability for non-loss events; these confidences only drive the card's wording
RULE_CONF_CLEAR, RULE_CONF_OTHER = 0.95, 0.7
NOISE_RISE_FACTOR = 1.5   # a drop no bigger than 1.5 × the sensor's unexplained rises that day is noise

ACTION_CHECK = "เทียบใบเติมน้ำมัน + สอบถามคนขับ"
ACTION_GAP = "ตรวจกล่อง GPS/สายไฟ ว่าถูกตัดไฟหรือไม่"
ACTION_SENSOR = "แจ้งผู้ให้บริการ GPS ตรวจเซนเซอร์"
ACTION_ESCALATE = "ส่งเรื่องหัวหน้าฟลีท"


def classify(ev: dict, settings: dict, day_status: str) -> str:
    if ev["kind"] == "refuel":
        return "refuel" if ev["stays_up_30"] else "noise"
    if day_status == "stuck" or ev["sensor_noise_parked"] > settings["faulty_sensor_pct"]:
        return "sensor_fault"
    if ev["recovered_30"] or ev["rebound_60"] or ev["litres"] <= NOISE_RISE_FACTOR * ev["day_rise_l"]:
        return "noise"
    if ev["excess_over_burn_l"] < settings["min_drop_l"]:
        return "consumption"
    if ev["kind"] == "gap" and ev["gap_min"] >= settings["gap_min"] and not ev["recovered_60"]:
        return "gap_loss"
    if not ev["recovered_60"]:
        return "suspected_loss"
    return "noise"


def score_v1(cls: str, ev: dict, settings: dict) -> int:
    if cls not in LOSS_CLASSES:
        return 0
    score = 50
    score += 15 if ev["engine_off_share"] >= 0.8 else 0
    score += 10 if ev["night"] else 0
    score += 10 if not ev["at_place"] else 0
    score += 10 if not ev["recovered_120"] else 0
    score += 10 if ev["rate_l_per_min"] >= 1 else 0
    score += 10 if ev.get("both_boxes") else 0
    score -= 20 if ev["sensor_noise_parked"] > settings["noisy_sensor_pct"] else 0
    return max(0, min(100, score))


def is_clear(cls: str, ev: dict, settings: dict) -> bool:
    """v1 auto-close: a dip that is fully back within 10 min, consumption within 2 L, a refuel that stays."""
    if cls == "noise":
        return bool(ev.get("recovered_10"))
    if cls == "consumption":
        return ev["excess_over_burn_l"] <= settings["clear_consumption_l"]
    if cls == "refuel":
        return bool(ev.get("stays_up_60"))
    return False


def phrases(ev: dict) -> dict[str, str]:
    """Thai evidence phrases keyed by the feature they describe (shared by rules and the model)."""
    out = {}
    if ev["kind"] == "refuel":
        out["litres"] = f"เติมน้ำมัน +{ev['litres']:.0f} L"
    else:
        out["litres"] = f"ลดลง {ev['litres']:.0f} L ({ev['pct_tank']:.0f}% ของถัง)"
    if ev["engine_off_share"] >= 0.8:
        out["engine_off_share"] = "จอดดับเครื่อง"
    if ev.get("recovered_30"):
        out["recovered_30"] = "ระดับกลับขึ้นภายใน 30 นาที"
    elif ev.get("rebound_60"):
        out["rebound_60"] = "ระดับกลับขึ้นเกินครึ่งภายใน 1 ชม."
    elif ev["kind"] != "refuel" and not ev.get("recovered_120"):
        out["recovered_120"] = "ระดับไม่กลับขึ้นหลัง 2 ชม."
    out["at_place"] = f"อยู่ที่ {ev['place_name']}" if ev["at_place"] else "ไม่ได้อยู่ในแพลนท์/อู่"
    if ev["night"]:
        out["night"] = "กลางคืน"
    if ev["rate_l_per_min"] >= 1:
        out["rate_l_per_min"] = f"ลดเร็ว {ev['rate_l_per_min']:.1f} L/นาที"
    if ev.get("both_boxes"):
        out["both_boxes"] = "กล่อง GPS ทั้ง 2 เจ้าเห็นตรงกัน"
    if ev["gap_min"] >= 10:
        out["gap_min"] = f"กล่อง GPS ขาดสัญญาณ {ev['gap_min']} นาที"
    if ev["kind"] != "refuel" and ev["excess_over_burn_l"] < 8:
        out["excess_over_burn_l"] = "ใกล้เคียงอัตราสิ้นเปลืองปกติ"
    if ev["day_rise_l"] > 0 and ev["litres"] <= NOISE_RISE_FACTOR * ev["day_rise_l"]:
        out["day_rise_l"] = f"วันเดียวกันระดับขึ้นเองรวม {ev['day_rise_l']:.0f} L"
    if ev["sensor_noise_parked"] > 3:
        out["sensor_noise_parked"] = "เซนเซอร์แกว่งมาก"
    return out


# which phrases explain each class, most telling first
_REASON_ORDER = {
    "suspected_loss": ["engine_off_share", "recovered_120", "at_place", "night", "rate_l_per_min", "both_boxes", "litres"],
    "gap_loss": ["gap_min", "recovered_120", "at_place", "night", "litres"],
    "noise": ["recovered_30", "rebound_60", "day_rise_l", "sensor_noise_parked", "litres"],
    "consumption": ["excess_over_burn_l", "litres"],
    "refuel": ["litres", "at_place"],
    "sensor_fault": ["sensor_noise_parked", "litres"],
}


def rule_reasons(cls: str, ev: dict) -> list[str]:
    available = phrases(ev)
    out = [available[key] for key in _REASON_ORDER[cls] if key in available]
    if cls == "sensor_fault" and "sensor_noise_parked" not in available:
        out.insert(0, "เซนเซอร์ค่าค้างทั้งวัน")
    return out[:3]


def action_for(cls: str, ev: dict, repeat: bool) -> str | None:
    if cls == "gap_loss":
        action = ACTION_GAP
    elif cls == "suspected_loss":
        action = ACTION_CHECK
    elif cls == "sensor_fault":
        action = ACTION_SENSOR
    else:
        return None
    return f"{action} + {ACTION_ESCALATE}" if repeat and cls in LOSS_CLASSES else action
```

- [ ] **Step 5: Run them to verify they pass**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_rules.py scripts/fuel/tests/test_fixtures_besttech.py -q`
Expected: `7 passed` (4 + 3). The fixture test proves both noisy real days produce candidates and none of them is a loss.

- [ ] **Step 6: Commit**

```bash
git add scripts/fuel/rules.py scripts/fuel/tests/test_rules.py scripts/fuel/tests/test_fixtures_besttech.py scripts/fuel/tests/data/besttech_ME152_2026-10-05.json scripts/fuel/tests/data/besttech_ME081_2026-10-05.json
git commit -m "feat(fuel): rules v1 — classes, score, clear cases, Thai reasons and actions; real-day fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Model v2 scorer (numpy)

**Files:**
- Create: `scripts/fuel/model.py`
- Test: `scripts/fuel/tests/test_model.py`

**Interfaces:**
- Consumes: Task 5 `phrases`.
- Produces: `FEATURES: list[str]` (21 names, fixed order), `PHRASE_KEY`, `feature_vector(ev) -> np.ndarray`, `predict(model, ev) -> (p: float, contributions: dict[str, float])` (raises `ValueError` for a model trained on another feature list), `model_reasons(contributions, ev, towards_loss, k=3) -> list[str]`. A model dict = `fuel_models` doc: `{version, coef, intercept, scaler_mean, scaler_scale, ...}`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_model.py`:
```python
import math

import pytest

from model import FEATURES, feature_vector, model_reasons, predict
from test_rules import ev


def toy_model(**coef):
    weights = [coef.get(name, 0.0) for name in FEATURES]
    return {"version": "lr-test", "coef": weights, "intercept": 0.0,
            "scaler_mean": [0.0] * len(FEATURES), "scaler_scale": [1.0] * len(FEATURES)}


def test_feature_vector_order_and_values():
    x = feature_vector(ev(day_rise_l=15.0, truck_confirmed_30d=2, both_boxes=True))
    assert len(x) == len(FEATURES)
    assert x[FEATURES.index("log_litres")] == pytest.approx(math.log(30.0))
    assert x[FEATURES.index("day_rise_ratio")] == 0.5
    assert x[FEATURES.index("both_boxes")] == 1.0 and x[FEATURES.index("truck_confirmed_30d")] == 2.0
    assert x[FEATURES.index("is_gap")] == 0.0 and x[FEATURES.index("is_besttech")] == 0.0


def test_predict_and_contributions():
    model = toy_model(engine_off_share=2.0, recovered_30=-3.0)
    p, contributions = predict(model, ev())
    assert p == pytest.approx(1 / (1 + math.exp(-2.0)))
    assert contributions["engine_off_share"] == 2.0 and contributions["recovered_30"] == 0.0


def test_zero_scale_is_safe():
    model = toy_model(engine_off_share=1.0)
    model["scaler_scale"] = [0.0] * len(FEATURES)
    assert predict(model, ev())[0] == pytest.approx(1 / (1 + math.exp(-1.0)))


def test_reasons_follow_contributions():
    _, contributions = predict(toy_model(engine_off_share=2.0, night=1.0, at_place=-1.0), ev())
    assert model_reasons(contributions, ev(), towards_loss=True) == ["จอดดับเครื่อง", "กลางคืน"]
    _, contributions = predict(toy_model(recovered_30=-2.0), ev(recovered_30=True))
    assert model_reasons(contributions, ev(recovered_30=True), towards_loss=False) == ["ระดับกลับขึ้นภายใน 30 นาที"]


def test_model_that_does_not_match_features_is_rejected():
    with pytest.raises(ValueError):
        predict({"version": "lr-old", "coef": [1.0], "intercept": 0.0, "scaler_mean": [0.0], "scaler_scale": [1.0]}, ev())
    stale = toy_model() | {"features": FEATURES[:-1] + ["something_else"]}
    with pytest.raises(ValueError):
        predict(stale, ev())
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_model.py -q`
Expected: `ModuleNotFoundError: No module named 'model'`.

- [ ] **Step 3: Implement `scripts/fuel/model.py`**

```python
"""Model v2 scorer (spec §4.5) — logistic regression stored as plain numbers; numpy only, so the
nightly job never imports scikit-learn. Training lives in train.py."""
import math

import numpy as np

from rules import phrases

FEATURES = ["log_litres", "pct_tank", "duration_min", "rate_l_per_min", "excess_over_burn_l",
            "recovered_30", "recovered_60", "recovered_120", "rebound_60", "engine_off_share",
            "moving_share", "gap_min", "sensor_noise_parked", "day_rise_ratio", "at_place", "night",
            "both_boxes", "truck_confirmed_30d", "driver_confirmed_30d", "is_besttech", "is_gap"]

# feature → key of rules.phrases() that explains it to a person
PHRASE_KEY = {"log_litres": "litres", "pct_tank": "litres", "day_rise_ratio": "day_rise_l",
              "is_gap": "gap_min", "duration_min": "rate_l_per_min"}


def feature_vector(ev: dict) -> np.ndarray:
    litres = max(float(ev["litres"]), 0.1)
    values = {
        "log_litres": math.log(litres),
        "pct_tank": ev["pct_tank"],
        "duration_min": ev["duration_min"],
        "rate_l_per_min": ev["rate_l_per_min"],
        "excess_over_burn_l": ev["excess_over_burn_l"],
        "recovered_30": ev["recovered_30"],
        "recovered_60": ev["recovered_60"],
        "recovered_120": ev["recovered_120"],
        "rebound_60": ev["rebound_60"],
        "engine_off_share": ev["engine_off_share"],
        "moving_share": ev["moving_share"],
        "gap_min": ev["gap_min"],
        "sensor_noise_parked": ev["sensor_noise_parked"],
        "day_rise_ratio": min(ev["day_rise_l"] / litres, 10.0),
        "at_place": ev["at_place"],
        "night": ev["night"],
        "both_boxes": ev.get("both_boxes", False),
        "truck_confirmed_30d": ev.get("truck_confirmed_30d", 0),
        "driver_confirmed_30d": ev.get("driver_confirmed_30d", 0),
        "is_besttech": ev["source"] == "besttech",
        "is_gap": ev["kind"] == "gap",
    }
    return np.array([float(values[name]) for name in FEATURES])


def predict(model: dict, ev: dict) -> tuple[float, dict[str, float]]:
    """P(real loss) and each feature's contribution (coef × standardized value) to the log-odds.
    Raises ValueError for a model trained on a different feature list (numpy would broadcast it)."""
    if (model.get("features", FEATURES) != FEATURES
            or not len(model["coef"]) == len(model["scaler_mean"]) == len(model["scaler_scale"]) == len(FEATURES)):
        raise ValueError(f"model {model.get('version')} does not match the current features")
    x = feature_vector(ev)
    scale = np.where(np.array(model["scaler_scale"]) == 0, 1.0, np.array(model["scaler_scale"]))
    z = (x - np.array(model["scaler_mean"])) / scale
    contributions = np.array(model["coef"]) * z
    logit = float(contributions.sum() + model["intercept"])
    return 1.0 / (1.0 + math.exp(-logit)), dict(zip(FEATURES, contributions.tolist()))


def model_reasons(contributions: dict[str, float], ev: dict, towards_loss: bool, k: int = 3) -> list[str]:
    """Thai phrases for the features that pushed hardest toward the suggestion."""
    available = phrases(ev)
    ranked = sorted(contributions.items(), key=lambda item: item[1], reverse=towards_loss)
    out: list[str] = []
    for name, value in ranked:
        if (value > 0) != towards_loss or value == 0:
            continue
        phrase = available.get(PHRASE_KEY.get(name, name))
        if phrase and phrase not in out:
            out.append(phrase)
        if len(out) == k:
            break
    return out or [available["litres"]]
```

- [ ] **Step 4: Run it to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_model.py -q`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/model.py scripts/fuel/tests/test_model.py
git commit -m "feat(fuel): logistic-regression scorer with per-feature reasons (numpy only)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Event assembly — merge boxes, score, status, re-run plan, summary

**Files:**
- Create: `scripts/fuel/events.py`
- Test: `scripts/fuel/tests/test_events.py`

**Interfaces:**
- Consumes: Task 5 rules API, Task 6 `predict`, `model_reasons`; Part 1 `series_build.thai_midnight_utc`.
- Produces: `event_id(plate, date_key, start_min) -> str`, `minute_utc(date_key, minute) -> datetime`, `raw_event(plate, truck_code, date_key, day_status, ev) -> dict`, `merge_sources(raw, merge_min) -> list[dict]`, `audit_pick(_id, rate) -> bool`, `score_event(raw, settings, model, driver, now) -> dict` (the `fuel_events` document; a model that does not match `FEATURES` falls back to rules v1, spec §6), `plan_rerun(new_events, existing) -> (upserts, stale_ids, delete_ids)`, `plate_statuses(series_docs, sparse_share) -> dict`, `daily_summary(date_key, series_docs, events, settings, now) -> dict`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_events.py`:
```python
from datetime import datetime

from events import (audit_pick, daily_summary, event_id, merge_sources, minute_utc, plan_rerun, raw_event,
                    score_event)
from fuel_settings import DEFAULTS
from test_model import toy_model
from test_rules import ev

NOW = datetime(2026, 10, 6, 21, 30)
KEY = "2026-10-05"


def raw(source="terminus", plate="สบ.71-0001", status="ok", **features):
    base = ev(**{"source": source, "start_min": 130, "end_min": 145, "lat": 13.7, "lng": 100.5, **features})
    return raw_event(plate, "ME001", KEY, status, base)


def test_ids_and_times():
    assert event_id("สบ.71-8635", KEY, 130) == "สบ.71-8635|2026-10-05T02:10"
    assert minute_utc(KEY, 130) == datetime(2026, 10, 4, 19, 10)


def test_merge_two_boxes_into_one():
    merged = merge_sources([raw("terminus", litres=30.0), raw("besttech", litres=28.0, start_min=132, end_min=150)], 30)
    assert len(merged) == 1
    e = merged[0]
    assert e["sources"] == ["besttech", "terminus"] and e["features"]["both_boxes"]
    assert e["features"]["litres"] == 30.0 and (e["features"]["start_min"], e["features"]["end_min"]) == (130, 150)


def test_same_box_or_other_direction_stays_apart():
    assert len(merge_sources([raw("terminus"), raw("terminus", start_min=140, end_min=150)], 30)) == 2
    assert len(merge_sources([raw("terminus"), raw("besttech", kind="refuel", stays_up_30=True)], 30)) == 2


def test_score_v1_suspected_loss_is_open():
    e = score_event(raw(), DEFAULTS, None, "สมชาย", NOW)
    assert (e["class"], e["status"], e["suggestion"], e["scorer"]) == ("suspected_loss", "open", "real_loss", "rules-v1")
    assert e["score"] == 100 and e["p_real_loss"] == 1.0 and e["confidence"] == 1.0
    assert e["_id"] == "สบ.71-0001|2026-10-05T02:10" and e["driver"] == "สมชาย"
    assert e["action"] == "เทียบใบเติมน้ำมัน + สอบถามคนขับ" and e["decision"] is None and not e["stale"]
    assert e["start"] == datetime(2026, 10, 4, 19, 10) and e["place"] == {"name": None, "lat": 13.7, "lng": 100.5}


def test_score_v1_clear_consumption_auto_closes_or_audits():
    e = score_event(raw(excess_over_burn_l=1.0), DEFAULTS, None, None, NOW)
    assert e["class"] == "consumption" and e["suggestion"] == "legit" and e["confidence"] == 0.95
    assert e["status"] == ("audit" if audit_pick(e["_id"], 0.05) else "auto_closed")


def test_score_v1_unclear_noise_goes_to_queue():
    e = score_event(raw(recovered_30=True), DEFAULTS, None, None, NOW)
    assert (e["class"], e["status"], e["suggestion"], e["confidence"]) == ("noise", "open", "noise", 0.7)


def test_audit_pick_is_deterministic_and_about_the_rate():
    ids = [f"สบ.71-{i:04d}|{KEY}T02:10" for i in range(2000)]
    picked = [i for i in ids if audit_pick(i, 0.05)]
    assert picked == [i for i in ids if audit_pick(i, 0.05)]
    assert 60 <= len(picked) <= 140 and not audit_pick(ids[0], 0)


def test_score_v2_uses_model_and_never_auto_closes_a_suggested_loss():
    model = toy_model(engine_off_share=5.0)
    e = score_event(raw(excess_over_burn_l=1.0), DEFAULTS, model, None, NOW)   # rules say consumption
    assert e["scorer"] == "lr-test" and e["suggestion"] == "real_loss" and e["status"] == "open"
    calm = score_event(raw(excess_over_burn_l=1.0, engine_off_share=0.0, recovered_120=True), DEFAULTS,
                       toy_model(engine_off_share=5.0, recovered_120=-4.0), None, NOW)   # p ≈ 0.018
    assert calm["suggestion"] == "legit" and calm["confidence"] >= 0.95 and calm["status"] in ("auto_closed", "audit")
    doubted = score_event(raw(recovered_120=True), DEFAULTS, toy_model(recovered_120=-4.0), None, NOW)
    assert doubted["class"] == "suspected_loss" and doubted["suggestion"] == "noise" and doubted["status"] == "open"


def test_plan_rerun_keeps_decisions():
    old_decided = score_event(raw(), DEFAULTS, None, None, NOW) | {"status": "decided", "decision": "real_loss",
                                                                  "review_id": "r1", "_id": "สบ.71-0001|2026-10-05T02:09"}
    old_open = score_event(raw(start_min=600, end_min=610), DEFAULTS, None, None, NOW)
    gone_decided = score_event(raw(start_min=900, end_min=910), DEFAULTS, None, None, NOW) | {"status": "decided", "decision": "noise"}
    new = [score_event(raw(), DEFAULTS, None, None, NOW)]
    upserts, stale, delete = plan_rerun(new, [old_decided, old_open, gone_decided])
    assert upserts[0]["_id"] == old_decided["_id"] and upserts[0]["status"] == "decided"
    assert upserts[0]["decision"] == "real_loss" and upserts[0]["review_id"] == "r1"
    assert stale == [gone_decided["_id"]] and delete == [old_open["_id"]]


def series_doc(plate, source, status, share=1.0):
    return {"plate": plate, "source": source, "coverage": {"status": status, "fuel_valid_share": share}}


def test_daily_summary():
    docs = [series_doc("A", "terminus", "ok"), series_doc("A", "besttech", "offline"),
            series_doc("B", "terminus", "ok", share=0.05), series_doc("C", "terminus", "no_data")]
    loss = score_event(raw(plate="A"), DEFAULTS, None, None, NOW)
    small = score_event(raw(plate="A", start_min=700, end_min=710, litres=10.0), DEFAULTS, None, None, NOW)
    closed = score_event(raw(plate="A", start_min=800, end_min=810, excess_over_burn_l=1.0), DEFAULTS, None, None, NOW)
    s = daily_summary(KEY, docs, [loss, small, closed], DEFAULTS, NOW)
    assert s["_id"] == KEY and s["trucks_expected"] == 3 and s["trucks_analysed"] == 1
    assert s["by_status"] == {"ok": 1, "stuck": 0, "no_sensor": 0, "offline": 0, "no_data": 1, "sparse": 1}
    assert s["events"] == 3 and s["open"] == 2 and s["auto_closed"] + s["audit"] == 1
    assert s["likely_litres"] == 40.0 and s["check_first"] == [loss["_id"], small["_id"]]
    assert s["sources_missing"] == [] and s["ai_text"] is None
    assert daily_summary(KEY, docs[2:], [], DEFAULTS, NOW)["sources_missing"] == ["besttech"]


def test_broken_model_falls_back_to_rules():
    broken = {"version": "lr-old", "coef": [1.0], "intercept": 0.0, "scaler_mean": [0.0], "scaler_scale": [1.0]}
    e = score_event(raw(), DEFAULTS, broken, None, NOW)
    assert e["scorer"] == "rules-v1" and e["class"] == "suspected_loss" and e["score"] == 100
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_events.py -q`
Expected: `ModuleNotFoundError: No module named 'events'`.

- [ ] **Step 3: Implement `scripts/fuel/events.py`**

```python
"""Assemble fuel_events for one day (spec §4.2, §4.5–§4.8) — pure functions, no I/O.

raw candidates per source → merge sources (both_boxes) → class + score (rules v1 or model v2)
→ suggestion / reasons / action → status (open / auto_closed / audit) → re-run plan against the
events already stored → daily summary.
"""
import hashlib
from datetime import date, datetime, timedelta

from model import model_reasons, predict
from rules import (LOSS_CLASSES, RULE_CONF_CLEAR, RULE_CONF_OTHER, SCORER_V1, SUGGESTION, action_for,
                   classify, is_clear, rule_reasons, score_v1)
from series_build import thai_midnight_utc

STATUS_ORDER = ["ok", "stuck", "no_sensor", "offline", "no_data"]   # best first, when two sources disagree
OVERLAP_TOL_MIN = 5


def event_id(plate: str, date_key: str, start_min: int) -> str:
    return f"{plate}|{date_key}T{start_min // 60:02d}:{start_min % 60:02d}"


def minute_utc(date_key: str, minute: int) -> datetime:
    return thai_midnight_utc(date.fromisoformat(date_key)) + timedelta(minutes=minute)


def raw_event(plate: str, truck_code: str | None, date_key: str, day_status: str, ev: dict) -> dict:
    return {"plate": plate, "truck_code": truck_code, "date_key": date_key, "day_status": day_status,
            "sources": [ev["source"]], "features": {**ev, "both_boxes": False}}


def _direction(e: dict) -> str:
    return "up" if e["features"]["kind"] == "refuel" else "down"


def merge_sources(raw: list[dict], merge_min: int) -> list[dict]:
    """Same plate, same direction, overlapping or closer than merge_min, different boxes → one event."""
    out: list[dict] = []
    for e in sorted(raw, key=lambda e: (e["plate"], e["features"]["start_min"])):
        match = next((o for o in out if o["plate"] == e["plate"] and _direction(o) == _direction(e)
                      and e["sources"][0] not in o["sources"]
                      and e["features"]["start_min"] - o["features"]["end_min"] < merge_min
                      and o["features"]["start_min"] - e["features"]["end_min"] < merge_min), None)
        if match is None:
            out.append(e)
            continue
        primary, other = (match, e) if match["features"]["litres"] >= e["features"]["litres"] else (e, match)
        merged = {**primary, "sources": sorted(set(match["sources"]) | set(e["sources"])),
                  "features": {**primary["features"], "both_boxes": True,
                               "start_min": min(match["features"]["start_min"], e["features"]["start_min"]),
                               "end_min": max(match["features"]["end_min"], e["features"]["end_min"])}}
        out[out.index(match)] = merged
    return out


def audit_pick(_id: str, rate: float) -> bool:
    """Deterministic 1-in-(1/rate) sample, so a re-run picks the same events."""
    if rate <= 0:
        return False
    return int(hashlib.sha1(_id.encode("utf-8")).hexdigest()[:8], 16) % max(1, round(1 / rate)) == 0


def score_event(raw: dict, settings: dict, model: dict | None, driver: str | None, now: datetime) -> dict:
    ev = raw["features"]
    cls = classify(ev, settings, raw["day_status"])
    if model:
        try:
            p, contributions = predict(model, ev)
        except (KeyError, TypeError, ValueError):
            model = None   # broken or out-of-date model → rules v1 (spec §6)
    if model:
        towards_loss = p >= 0.5
        suggestion = "real_loss" if towards_loss else ("noise" if cls in LOSS_CLASSES else SUGGESTION[cls])
        confidence = p if towards_loss else 1 - p
        reasons = model_reasons(contributions, ev, towards_loss)
        scorer = model["version"]
        clear = cls not in LOSS_CLASSES and not towards_loss and confidence >= settings["auto_close_conf"]
        score = round(p * 100)
    else:
        score = score_v1(cls, ev, settings)
        p = score / 100
        suggestion = SUGGESTION[cls]
        clear = is_clear(cls, ev, settings)
        confidence = p if cls in LOSS_CLASSES else (RULE_CONF_CLEAR if clear else RULE_CONF_OTHER)
        reasons = rule_reasons(cls, ev)
        scorer = SCORER_V1
    _id = event_id(raw["plate"], raw["date_key"], ev["start_min"])
    if cls in LOSS_CLASSES or suggestion == "real_loss" or not clear:
        status = "open"
    else:
        status = "audit" if audit_pick(_id, settings["audit_rate"]) else "auto_closed"
    repeat = max(ev.get("truck_confirmed_30d", 0), ev.get("driver_confirmed_30d", 0)) >= 2
    return {
        "_id": _id, "plate": raw["plate"], "truck_code": raw["truck_code"], "driver": driver,
        "date_key": raw["date_key"],
        "start": minute_utc(raw["date_key"], ev["start_min"]), "end": minute_utc(raw["date_key"], ev["end_min"]),
        "sources": raw["sources"], "kind": ev["kind"], "class": cls,
        "litres": ev["litres"], "pct_tank": ev["pct_tank"],
        "score": score, "p_real_loss": round(p, 4), "suggestion": suggestion, "confidence": round(confidence, 4),
        "reasons": reasons, "action": action_for(cls, ev, repeat), "features": ev,
        "place": {"name": ev["place_name"], "lat": ev["lat"], "lng": ev["lng"]},
        "status": status, "decision": None, "review_id": None, "scorer": scorer, "stale": False,
        "created_at": now, "updated_at": now,
    }


def _overlaps(a: dict, b: dict) -> bool:
    tol = timedelta(minutes=OVERLAP_TOL_MIN)
    return a["plate"] == b["plate"] and a["start"] <= b["end"] + tol and b["start"] <= a["end"] + tol


def plan_rerun(new_events: list[dict], existing: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    """Re-running a day: decided events keep their _id and decision when a new event overlaps them
    (matched by plate + window, not _id — a start can shift by a minute); decided events no longer
    found are marked stale; every other stored event of the day is replaced.
    Returns (documents to write, _ids to mark stale, _ids to delete)."""
    decided = [e for e in existing if e["status"] == "decided"]
    upserts: list[dict] = []
    matched: set[str] = set()
    for event in new_events:
        match = next((d for d in decided if d["_id"] not in matched and _overlaps(d, event)), None)
        if match:
            matched.add(match["_id"])
            event = {**event, "_id": match["_id"], "status": "decided", "decision": match.get("decision"),
                     "review_id": match.get("review_id"), "created_at": match.get("created_at", event["created_at"])}
        upserts.append(event)
    written = {e["_id"] for e in upserts}
    stale = [d["_id"] for d in decided if d["_id"] not in matched]
    delete = [e["_id"] for e in existing if e["status"] != "decided" and e["_id"] not in written]
    return upserts, stale, delete


def plate_statuses(series_docs: list[dict], sparse_share: float) -> dict[str, str]:
    """One status per plate: the best of its sources; 'sparse' when readings exist but too few are valid."""
    out: dict[str, str] = {}
    for doc in series_docs:
        cov = doc.get("coverage") or {}
        status = cov.get("status", "no_data")
        if status == "ok" and cov.get("fuel_valid_share", 0) < sparse_share:
            status = "sparse"
        current = out.get(doc["plate"])
        order = STATUS_ORDER + ["sparse"]
        if current is None or order.index(status) < order.index(current):
            out[doc["plate"]] = status
    return out


def daily_summary(date_key: str, series_docs: list[dict], events: list[dict], settings: dict, now: datetime) -> dict:
    statuses = plate_statuses(series_docs, settings["sparse_share"])
    by_status = {s: 0 for s in STATUS_ORDER + ["sparse"]}
    for status in statuses.values():
        by_status[status] += 1
    open_loss = [e for e in events if e["status"] in ("open", "audit") and e["suggestion"] == "real_loss"]
    ranked = sorted(open_loss, key=lambda e: e["p_real_loss"] * e["litres"], reverse=True)
    sources = {d["source"] for d in series_docs}
    return {
        "_id": date_key,
        "trucks_expected": len(statuses),
        "trucks_analysed": sum(1 for s in statuses.values() if s in ("ok", "stuck")),
        "by_status": by_status,
        "events": len(events),
        "auto_closed": sum(1 for e in events if e["status"] == "auto_closed"),
        "open": sum(1 for e in events if e["status"] == "open"),
        "audit": sum(1 for e in events if e["status"] == "audit"),
        "decided": sum(1 for e in events if e["status"] == "decided"),
        "likely_litres": round(sum(e["p_real_loss"] * e["litres"] for e in open_loss), 1),
        "check_first": [e["_id"] for e in ranked[:3]],
        "sources_missing": [s for s in ("besttech", "terminus") if s not in sources],
        "ai_text": None,
        "updated_at": now,
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_events.py -q`
Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/events.py scripts/fuel/tests/test_events.py
git commit -m "feat(fuel): event assembly — box merge, scoring, audit sample, re-run plan, daily summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Store helpers, the `fuel_events` job, and the nightly step

**Files:**
- Create: `scripts/fuel/events_store.py`, `scripts/fuel/pipeline_fuel_events.py`
- Modify: `scripts/fuel/pipeline_fuel_nightly.py`, `routes/pipeline/pipeline_routes.py`
- Test: `scripts/fuel/tests/fake_mongo.py`, `scripts/fuel/tests/test_events_store.py`, `scripts/fuel/tests/test_pipeline_fuel_events.py`

**Interfaces:**
- Consumes: Tasks 1–7; Part 1 `series_store.SERIES`, `dates.parse_days`, `plates.terminus_plate`.
- Produces: `events_store`: `EVENTS, SUMMARY, DAY_STATS, MODELS, PLACES, TRIP_SUMMARY`, `ensure_event_indexes`, `load_existing_events`, `write_events(db, upserts, stale_ids, delete_ids, now)`, `save_summary`, `save_day_stats`, `load_day_stats(db, date_from, date_to)`, `load_active_model`, `load_places`, `history_counts(db, date_key, days=30) -> (Counter, Counter)`, `clean_text`, `drivers_for(db, plates, date_key) -> dict`; `pipeline_fuel_events.run_day(client, day, now=None) -> dict` (counts: `events, open, auto_closed, audit, stale, deleted, scorer`).

- [ ] **Step 1: Write the fake Mongo and the failing tests**

`scripts/fuel/tests/fake_mongo.py`:
```python
"""Just enough in-memory Mongo for the job tests: equality, $in, $nin, $gt/$gte/$lt/$lte, $ne."""
import copy


def _match_value(value, cond) -> bool:
    if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
        for op, arg in cond.items():
            if op == "$in" and value not in arg:
                return False
            if op == "$nin" and value in arg:
                return False
            if op == "$ne" and value == arg:
                return False
            if op in ("$gt", "$gte", "$lt", "$lte"):
                if value is None:
                    return False
                if op == "$gt" and not value > arg:
                    return False
                if op == "$gte" and not value >= arg:
                    return False
                if op == "$lt" and not value < arg:
                    return False
                if op == "$lte" and not value <= arg:
                    return False
        return True
    return value == cond


def matches(doc: dict, query: dict) -> bool:
    return all(_match_value(doc.get(key), cond) for key, cond in query.items())


class FakeCollection:
    def __init__(self):
        self.docs: dict = {}

    def create_index(self, *args, **kwargs):
        return "ok"

    def find(self, query=None, projection=None, sort=None):
        return [copy.deepcopy(d) for d in self.docs.values() if matches(d, query or {})]

    def find_one(self, query=None, projection=None, sort=None):
        rows = self.find(query)
        if sort:
            key, direction = sort[0]
            rows.sort(key=lambda d: d.get(key), reverse=direction < 0)
        return rows[0] if rows else None

    def count_documents(self, query):
        return len(self.find(query))

    def replace_one(self, query, doc, upsert=False):
        self.docs[doc["_id"]] = copy.deepcopy(doc)

    def bulk_write(self, ops, ordered=True):
        for op in ops:
            self.replace_one(op._filter, op._doc, upsert=op._upsert)

    def update_many(self, query, update):
        for d in self.docs.values():
            if matches(d, query):
                d.update(update.get("$set", {}))

    def delete_many(self, query):
        for key in [k for k, d in self.docs.items() if matches(d, query)]:
            del self.docs[key]


class FakeDB(dict):
    def __getitem__(self, name):
        return self.setdefault(name, FakeCollection())


class FakeClient(dict):
    def __getitem__(self, name):
        return self.setdefault(name, FakeDB())
```

`scripts/fuel/tests/test_events_store.py`:
```python
from datetime import datetime

from events_store import EVENTS, TRIP_SUMMARY, drivers_for, history_counts, write_events


class FakeCollection:
    def __init__(self, rows=()):
        self.rows, self.calls = list(rows), []

    def find(self, query, projection=None):
        self.calls.append(("find", query))
        return list(self.rows)

    def bulk_write(self, ops, ordered=True):
        self.calls.append(("bulk_write", len(ops)))

    def update_many(self, query, update):
        self.calls.append(("update_many", query, update))

    def delete_many(self, query):
        self.calls.append(("delete_many", query))


class FakeDB(dict):
    def __getitem__(self, name):
        return self.setdefault(name, FakeCollection())


def test_drivers_from_trip_summary():
    db = FakeDB()
    db[TRIP_SUMMARY] = FakeCollection([{"_id": "71-0429_2026-10-01", "Supervisor": "ฉกาจ วัตวะนะแดง"},
                                       {"_id": "71-0001_2026-10-01", "Supervisor": "nan"}])
    out = drivers_for(db, ["สบ.71-0429", "สบ.71-0001", "สบ.71-0429"], "2026-10-01")
    assert out == {"สบ.71-0429": "ฉกาจ วัตวะนะแดง"}
    _, query = db[TRIP_SUMMARY].calls[0]
    assert sorted(query["_id"]["$in"]) == ["71-0001_2026-10-01", "71-0429_2026-10-01"]


def test_history_counts_previous_30_days():
    db = FakeDB()
    db[EVENTS] = FakeCollection([{"plate": "A", "driver": "x"}, {"plate": "A", "driver": None}, {"plate": "B", "driver": "x"}])
    plates, drivers = history_counts(db, "2026-10-05")
    assert plates == {"A": 2, "B": 1} and drivers == {"x": 2}
    _, query = db[EVENTS].calls[0]
    assert query == {"decision": "real_loss", "date_key": {"$gte": "2026-09-05", "$lt": "2026-10-05"}}


def test_write_events_never_deletes_decided():
    db = FakeDB()
    write_events(db, [{"_id": "a"}], ["s"], ["d"], datetime(2026, 10, 6))
    calls = db[EVENTS].calls
    assert calls[0] == ("bulk_write", 1)
    assert calls[1][0] == "update_many" and calls[1][1] == {"_id": {"$in": ["s"]}}
    assert calls[2] == ("delete_many", {"_id": {"$in": ["d"]}, "status": {"$ne": "decided"}})
```

`scripts/fuel/tests/test_pipeline_fuel_events.py`:
```python
from datetime import datetime

from fake_mongo import FakeClient
from pipeline_fuel_events import run_day
from synth import DAY, consumption_day, series, siphon_day

NOW = datetime(2026, 10, 6, 21, 30)


def client_with_trucks():
    client = FakeClient()
    db = client["analytics"]
    sparse = siphon_day()[:10] + [(m, None, 0.0, 0, 13.7, 100.5) for m in range(10, 360)]   # 10 valid minutes of 360
    for plate, points in [("สบ.71-0001", siphon_day()), ("สบ.71-0002", consumption_day()), ("สบ.71-0003", sparse)]:
        doc, _ = series(points, plate=plate)
        db["gps_series"].replace_one({"_id": doc["_id"]}, doc)
    client["analytics"]["engineon_trip_summary"].replace_one(
        {"_id": "71-0001_2026-10-05"}, {"_id": "71-0001_2026-10-05", "Supervisor": "สมชาย ใจดี"})
    return client


def test_run_day_stores_events_stats_and_summary():
    client = client_with_trucks()
    result = run_day(client, DAY, now=NOW)
    db = client["analytics"]
    events = {e["plate"]: e for e in db["fuel_events"].find({})}
    loss = events["สบ.71-0001"]
    assert loss["class"] == "suspected_loss" and loss["status"] == "open" and loss["driver"] == "สมชาย ใจดี"
    assert loss["_id"].startswith("สบ.71-0001|2026-10-05T02:")
    assert events["สบ.71-0002"]["class"] == "consumption"
    assert result["events"] == 2 and result["open"] == 1 and result["scorer"] == "rules-v1"
    summary = db["fuel_daily_summary"].find_one({"_id": "2026-10-05"})
    assert summary["check_first"] == [loss["_id"]] and summary["trucks_analysed"] == 2
    assert summary["by_status"]["sparse"] == 1 and "สบ.71-0003" not in events
    assert summary["sources_missing"] == ["besttech"]
    assert len(db["fuel_day_stats"].find({})) == 2


def test_rerun_keeps_the_reviewers_decision():
    client = client_with_trucks()
    run_day(client, DAY, now=NOW)
    events = client["analytics"]["fuel_events"]
    loss_id = next(e["_id"] for e in events.find({"plate": "สบ.71-0001"}))
    events.update_many({"_id": loss_id}, {"$set": {"status": "decided", "decision": "real_loss", "review_id": "r1"}})
    run_day(client, DAY, now=NOW)
    kept = events.find_one({"_id": loss_id})
    assert kept["status"] == "decided" and kept["decision"] == "real_loss" and kept["review_id"] == "r1"
    assert len(events.find({})) == 2
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_events_store.py scripts/fuel/tests/test_pipeline_fuel_events.py -q`
Expected: `No module named 'events_store'` and `No module named 'pipeline_fuel_events'`.

- [ ] **Step 3: Implement `scripts/fuel/events_store.py`**

```python
"""Mongo access for Part 2 collections (spec §4.5–§4.8): fuel_events, fuel_daily_summary,
fuel_day_stats, fuel_models, fuel_places; plus the driver lookup in engineon_trip_summary."""
from collections import Counter
from datetime import date, datetime, timedelta

from pymongo import ASCENDING, DESCENDING, ReplaceOne

from plates import terminus_plate

EVENTS = "fuel_events"
SUMMARY = "fuel_daily_summary"
DAY_STATS = "fuel_day_stats"
MODELS = "fuel_models"
PLACES = "fuel_places"
TRIP_SUMMARY = "engineon_trip_summary"
NO_VALUE = {"", "nan", "none", "null"}


def ensure_event_indexes(db) -> None:
    db[EVENTS].create_index([("date_key", DESCENDING), ("status", ASCENDING), ("score", DESCENDING)],
                            name="date_status_score")
    db[EVENTS].create_index([("plate", ASCENDING), ("start", DESCENDING)], name="plate_start")
    db[DAY_STATS].create_index([("plate", ASCENDING), ("date_key", DESCENDING)], name="plate_date")
    db[DAY_STATS].create_index([("date_key", ASCENDING)], name="date")


def load_existing_events(db, date_key: str) -> list[dict]:
    return list(db[EVENTS].find({"date_key": date_key}))


def write_events(db, upserts: list[dict], stale_ids: list[str], delete_ids: list[str], now: datetime) -> None:
    if upserts:
        db[EVENTS].bulk_write([ReplaceOne({"_id": e["_id"]}, e, upsert=True) for e in upserts], ordered=False)
    if stale_ids:
        db[EVENTS].update_many({"_id": {"$in": stale_ids}}, {"$set": {"stale": True, "updated_at": now}})
    if delete_ids:
        db[EVENTS].delete_many({"_id": {"$in": delete_ids}, "status": {"$ne": "decided"}})


def save_summary(db, summary: dict) -> None:
    db[SUMMARY].replace_one({"_id": summary["_id"]}, summary, upsert=True)


def save_day_stats(db, stats: list[dict]) -> None:
    if stats:
        db[DAY_STATS].bulk_write([ReplaceOne({"_id": s["_id"]}, s, upsert=True) for s in stats], ordered=False)


def load_day_stats(db, date_from: str, date_to: str) -> list[dict]:
    return list(db[DAY_STATS].find({"date_key": {"$gte": date_from, "$lte": date_to}},
                                   {"plate": 1, "date_key": 1, "idle_rates": 1, "km_rates": 1}))


def load_active_model(db) -> dict | None:
    return db[MODELS].find_one({"active": True}, sort=[("created_at", DESCENDING)])


def load_places(db) -> list[dict]:
    return list(db[PLACES].find({}))


def history_counts(db, date_key: str, days: int = 30) -> tuple[Counter, Counter]:
    """Confirmed real losses per plate and per driver in the `days` before `date_key`."""
    day = date.fromisoformat(date_key)
    query = {"decision": "real_loss",
             "date_key": {"$gte": (day - timedelta(days=days)).isoformat(), "$lt": date_key}}
    plates, drivers = Counter(), Counter()
    for e in db[EVENTS].find(query, {"plate": 1, "driver": 1}):
        plates[e["plate"]] += 1
        if e.get("driver"):
            drivers[e["driver"]] += 1
    return plates, drivers


def clean_text(value) -> str | None:
    text = str(value).strip() if value is not None else ""
    return None if text.lower() in NO_VALUE else text


def drivers_for(db, plates: list[str], date_key: str) -> dict[str, str]:
    """Driver per plate for the day from engineon_trip_summary (_id "<raw plate>_<YYYY-MM-DD>",
    driver in Supervisor — the same rule the engine-on report uses)."""
    ids = {f"{terminus_plate(p)}_{date_key}": p for p in set(plates)}
    out = {}
    for row in db[TRIP_SUMMARY].find({"_id": {"$in": list(ids)}}, {"Supervisor": 1}):
        driver = clean_text(row.get("Supervisor"))
        if driver:
            out[ids[row["_id"]]] = driver
    return out
```

- [ ] **Step 4: Implement `scripts/fuel/pipeline_fuel_events.py`**

```python
"""fuel_events — detect, score and store one day's fuel events (spec §4). Runs as the last step of
fuel_nightly; registered on its own for re-runs: START_DATE / END_DATE (dd/mm/YYYY), default yesterday.

Pass 1: every truck-day with enough valid fuel minutes → burn-rate observations (fuel_day_stats).
Baselines: median of the truck's last `baseline_days` of observations (today included), fleet median
below `baseline_min_days`. Pass 2: candidates → evidence → merge boxes → score → re-run plan → store
events and the daily summary.
"""
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log, yesterday_bkk  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from baseline import day_rates, fleet_baseline, truck_baseline  # noqa: E402
from dates import parse_days  # noqa: E402
from detect import day_series, find_candidates, prepare  # noqa: E402
from events import daily_summary, merge_sources, plan_rerun, raw_event, score_event  # noqa: E402
from events_store import (drivers_for, ensure_event_indexes, history_counts, load_active_model,  # noqa: E402
                          load_day_stats, load_existing_events, load_places, save_day_stats, save_summary,
                          write_events)
from features import day_evidence, evidence  # noqa: E402
from fuel_settings import load_settings  # noqa: E402
from series_store import SERIES  # noqa: E402


def run_day(client, day: date, now: datetime | None = None) -> dict:
    db = client["analytics"]
    ensure_event_indexes(db)
    settings = load_settings(db)
    key = day.isoformat()
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    docs = list(db[SERIES].find({"date_key": key}))

    prepared, stats_today = [], []
    for doc in docs:
        series = day_series(doc)
        if series is None or series.valid_share < settings["sparse_share"]:
            continue
        ctx = prepare(series, settings)
        prepared.append((doc, series, ctx))
        stats_today.append({"_id": f"{doc['plate']}|{key}|{doc['source']}", "plate": doc["plate"],
                            "source": doc["source"], "date_key": key, **day_rates(series, ctx)})

    window_from = (day - timedelta(days=settings["baseline_days"] - 1)).isoformat()
    history = [s for s in load_day_stats(db, window_from, key) if s["date_key"] != key] + stats_today
    fleet = fleet_baseline(history)
    per_plate = defaultdict(list)
    for s in history:
        per_plate[s["plate"]].append(s)

    places = load_places(db)
    raw = []
    for doc, series, ctx in prepared:
        base = truck_baseline(per_plate[doc["plate"]], fleet, settings["baseline_min_days"])
        day_ev = day_evidence(series, ctx, settings)
        for candidate in find_candidates(series, ctx, settings):
            ev = evidence(series, ctx, candidate, base, settings, places, day_ev)
            raw.append(raw_event(doc["plate"], doc.get("truck_code"), key, series.status, ev))

    model = load_active_model(db)
    plates_hist, drivers_hist = history_counts(db, key)
    drivers = drivers_for(db, [d["plate"] for d in docs], key)
    scored = []
    for r in merge_sources(raw, settings["merge_min"]):
        driver = drivers.get(r["plate"])
        r["features"]["truck_confirmed_30d"] = plates_hist.get(r["plate"], 0)
        r["features"]["driver_confirmed_30d"] = drivers_hist.get(driver, 0) if driver else 0
        scored.append(score_event(r, settings, model, driver, now))

    existing = load_existing_events(db, key)
    upserts, stale, delete = plan_rerun(scored, existing)
    write_events(db, upserts, stale, delete, now)
    save_day_stats(db, stats_today)
    kept = upserts + [e for e in existing if e["_id"] in set(stale)]
    summary = daily_summary(key, docs, kept, settings, now)
    save_summary(db, summary)
    log.info("fuel_events %s: %d events (%d open, %d auto-closed, %d audit), %d stale, %d deleted",
             key, len(upserts), summary["open"], summary["auto_closed"], summary["audit"], len(stale), len(delete))
    return {"events": len(upserts), "open": summary["open"], "auto_closed": summary["auto_closed"],
            "audit": summary["audit"], "stale": len(stale), "deleted": len(delete),
            "scorer": model["version"] if model else "rules-v1"}


def main() -> None:
    yesterday = yesterday_bkk().strftime("%d/%m/%Y")
    start, end = os.getenv("START_DATE", yesterday), os.getenv("END_DATE", yesterday)
    job = JobLog("fuel_events", "fuel_events", {"start_date": start, "end_date": end})
    try:
        client = MongoClient(MONGODB_URI)
        totals: dict = defaultdict(int)
        for day in parse_days(start, end):
            for k, v in run_day(client, day).items():
                if isinstance(v, int):
                    totals[k] += v
        job.finish("success", records=totals["events"], **{k: v for k, v in totals.items() if k != "events"})
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run them to verify they pass**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_events_store.py scripts/fuel/tests/test_pipeline_fuel_events.py -q`
Expected: `5 passed` (3 + 2).

- [ ] **Step 6: Make fuel_events the last step of fuel_nightly**

In `scripts/fuel/pipeline_fuel_nightly.py`:
- replace the docstring line `Part 2 appends the fuel_events step.` with `3. fuel_events for yesterday (Part 2) — a failure here fails the run, after Terminus is stored.`
- after the line `from dates import ddmmyyyy  # noqa: E402` add `from pipeline_fuel_events import run_day  # noqa: E402`
- after the line `        result["terminus_docs"] = ingest_terminus_day(client["terminus"], db, day)` add `        result["events"] = run_day(client, day)["events"]`

Register the job for manual re-runs in `routes/pipeline/pipeline_routes.py`, after each `"fuel_tanks"` line:
- `PIPELINE_SCRIPTS`: `    "fuel_events": SCRIPTS_DIR / "fuel" / "pipeline_fuel_events.py",`
- `PIPELINE_NAMES`: `                  "fuel_events": "fuel_events",`
- `RUN_LOG_LOCATION`: `    "fuel_events": ("analytics", "etl_jobs"),`

Verify:
```bash
grep -c '"fuel_events"' routes/pipeline/pipeline_routes.py
grep -n "run_day" scripts/fuel/pipeline_fuel_nightly.py
.venv/bin/python -m py_compile routes/pipeline/pipeline_routes.py scripts/fuel/pipeline_fuel_nightly.py scripts/fuel/pipeline_fuel_events.py && echo ok
.venv/bin/python -m pytest scripts/fuel/tests -q | tail -1
```
Expected: `3`, two `run_day` lines (import + call), `ok`, all fuel tests pass.

- [ ] **Step 7: Commit**

```bash
git checkout -- __pycache__/database.cpython-314.pyc 2>/dev/null; git status --short
git add scripts/fuel/events_store.py scripts/fuel/pipeline_fuel_events.py scripts/fuel/pipeline_fuel_nightly.py routes/pipeline/pipeline_routes.py scripts/fuel/tests/fake_mongo.py scripts/fuel/tests/test_events_store.py scripts/fuel/tests/test_pipeline_fuel_events.py
git commit -m "feat(fuel): fuel_events job (+ last step of fuel_nightly)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `fuel_places` job (weekly)

**Files:**
- Create: `scripts/fuel/pipeline_fuel_places.py`
- Modify: `routes/pipeline/pipeline_routes.py`, `main.py`
- Test: `scripts/fuel/tests/test_pipeline_fuel_places.py`

**Interfaces:**
- Consumes: Task 1 `plant_places`, `besttech_places`, `BesttechClient.location`; Task 8 `PLACES`; Part 1 `series_besttech.make_client`.
- Produces: `refresh_places(client, besttech) -> dict` (`plants, besttech_pois | besttech_error, records`).

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_pipeline_fuel_places.py`:
```python
from fake_mongo import FakeClient
from pipeline_fuel_places import refresh_places

PLANT = {"_id": "x", "client": "ACON", "plant_code": "A109", "Latitude": "14.05", "Longitude": "100.56"}
POI = {"code": "L009", "name": "อู่ MENA", "lat": 13.76, "lng": 100.76, "radius": 150, "geofence": [], "status": "A"}


class FakeBesttech:
    def __init__(self, rows=None, error=None):
        self.rows, self.error = rows or [], error

    def location(self):
        if self.error:
            raise self.error
        return self.rows


def test_refresh_writes_plants_and_pois_and_drops_old_ones():
    client = FakeClient()
    client["atms"]["plants"].replace_one({"_id": "x"}, PLANT)
    client["analytics"]["fuel_places"].replace_one({"_id": "old"}, {"_id": "old"})
    result = refresh_places(client, FakeBesttech([POI]))
    ids = sorted(d["_id"] for d in client["analytics"]["fuel_places"].find({}))
    assert ids == ["besttech:L009", "plant:A109"] and result == {"plants": 1, "besttech_pois": 1, "records": 2}


def test_besttech_down_still_writes_plants():
    client = FakeClient()
    client["atms"]["plants"].replace_one({"_id": "x"}, PLANT)
    result = refresh_places(client, FakeBesttech(error=RuntimeError("TooManyRequests")))
    assert [d["_id"] for d in client["analytics"]["fuel_places"].find({})] == ["plant:A109"]
    assert result["besttech_error"] == "TooManyRequests" and result["records"] == 1
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_pipeline_fuel_places.py -q`
Expected: `ModuleNotFoundError: No module named 'pipeline_fuel_places'`.

- [ ] **Step 3: Implement `scripts/fuel/pipeline_fuel_places.py`**

```python
"""fuel_places (Mondays 01:00 BKK) — known places for the "at a place" evidence (spec §4.3):
atms.plants (300 m circles) + Besttech /location POIs. Replaces the whole collection each run; if
Besttech is down the plants are still written and the error is recorded."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log  # noqa: E402
from pymongo import MongoClient, ReplaceOne  # noqa: E402

from events_store import PLACES  # noqa: E402
from places import besttech_places, plant_places  # noqa: E402
from series_besttech import make_client  # noqa: E402


def refresh_places(client, besttech) -> dict:
    """Rewrite analytics.fuel_places from atms.plants and `besttech.location()` (errors there only
    drop the POIs). Returns counts for the job log."""
    db = client["analytics"]
    rows = list(client["atms"]["plants"].find({}, {"_id": 0, "client": 1, "plant_code": 1,
                                                    "Latitude": 1, "Longitude": 1}))
    places = plant_places(rows)
    result: dict = {"plants": len(places)}
    try:
        pois = besttech_places(besttech.location())
        places += pois
        result["besttech_pois"] = len(pois)
    except Exception as e:  # plants are still worth writing
        log.error("besttech /location failed: %s", e)
        result["besttech_error"] = str(e)
    unique = {p["_id"]: p for p in places}
    if unique:
        db[PLACES].bulk_write([ReplaceOne({"_id": k}, v, upsert=True) for k, v in unique.items()], ordered=False)
        db[PLACES].delete_many({"_id": {"$nin": list(unique)}})
    result["records"] = len(unique)
    return result


def main() -> None:
    job = JobLog("fuel_places", "fuel_places")
    try:
        job.finish("success", **refresh_places(MongoClient(MONGODB_URI), make_client()))
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run it to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_pipeline_fuel_places.py -q`
Expected: `2 passed`.

- [ ] **Step 5: Register and schedule**

`routes/pipeline/pipeline_routes.py`, after each `"fuel_events"` line:
- `PIPELINE_SCRIPTS`: `    "fuel_places": SCRIPTS_DIR / "fuel" / "pipeline_fuel_places.py",`
- `PIPELINE_NAMES`: `                  "fuel_places": "fuel_places",`
- `RUN_LOG_LOCATION`: `    "fuel_places": ("analytics", "etl_jobs"),`

`main.py`, directly after the line that schedules `fuel_nightly` (`id="sched_fuel_nightly"`):
```python
    # fuel_places — Mondays 01:00 BKK → Sundays 18:00 UTC: one Besttech /location call, 30 min before
    # the 18:30 UTC Besttech pull so the two never share the key's rate limit
    scheduler.add_job(_run, CronTrigger(day_of_week="sun", hour=18, minute=0), args=["fuel_places"], id="sched_fuel_places")  # Mon 01:00 BKK
```

Verify: `grep -c '"fuel_places"' routes/pipeline/pipeline_routes.py` → `3`; `grep -n sched_fuel_places main.py` → one line; `.venv/bin/python -m py_compile main.py routes/pipeline/pipeline_routes.py scripts/fuel/pipeline_fuel_places.py && echo ok` → `ok`.

- [ ] **Step 6: Commit**

```bash
git add scripts/fuel/pipeline_fuel_places.py scripts/fuel/tests/test_pipeline_fuel_places.py routes/pipeline/pipeline_routes.py main.py
git commit -m "feat(fuel): weekly fuel_places (atms plants + Besttech POIs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Model training (`fuel_train`, monthly)

**Files:**
- Create: `scripts/fuel/train.py`, `scripts/fuel/pipeline_fuel_train.py`
- Modify: `requirements.txt` (+`scikit-learn`), `requirements-dev.txt` (+`scikit-learn`), `routes/pipeline/pipeline_routes.py`, `main.py`
- Test: `scripts/fuel/tests/test_train.py`

**Interfaces:**
- Consumes: Task 6 `FEATURES`, `feature_vector`, `predict`; Task 5 `SCORER_V1`, `score_v1`; Task 8 `EVENTS`, `MODELS`, `load_active_model`; Part 1 `normalize_plate`.
- Produces: `build_dataset(events, reviews) -> list[{"event", "y", "w"}]`, `split_by_day(rows, holdout_share=0.3)`, `precision_recall_at_k(rows, scores, k=20) -> (precision, recall)`, `rules_scores`, `model_scores`, `fit(rows) -> dict`, `train(rows, active_model, settings, now) -> dict` (`status: skipped | kept | promoted`, `metrics`, `model` = `fuel_models` doc `{_id, version "lr-YYYY-MM-DD", created_at, active, algo, features, coef, intercept, scaler_mean, scaler_scale, metrics, n_labels}`).

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_train.py`:
```python
import random
from datetime import date, datetime, timedelta, timezone

import pytest

from fuel_settings import DEFAULTS
from test_rules import ev
from train import build_dataset, precision_recall_at_k, split_by_day, train

NOW = datetime(2026, 11, 2, 20, 30)


def event(_id, day, start_h=2, plate="สบ.71-0001", status="open", decision=None, **features):
    start = datetime.combine(day, datetime.min.time()) + timedelta(hours=start_h) - timedelta(hours=7)
    return {"_id": _id, "plate": plate, "date_key": day.isoformat(), "start": start, "end": start + timedelta(minutes=15),
            "kind": "drop", "class": "suspected_loss", "status": status, "decision": decision, "features": ev(**features)}


def ms(day, hour):
    return datetime.combine(day, datetime.min.time(), tzinfo=timezone(timedelta(hours=7))).timestamp() * 1000 + hour * 3600_000


def test_build_dataset_queue_and_weak_labels():
    d1, d2 = date(2026, 10, 1), date(2026, 10, 2)
    events = [event("q1", d1, status="decided", decision="real_loss"),
              event("q2", d1, start_h=5, status="decided", decision="follow_up"),
              event("w1", d2, start_h=2, excess_over_burn_l=10.0), event("w2", d2, start_h=4, excess_over_burn_l=25.0),
              event("w3", d2, start_h=20, plate="สบ.71-0002")]
    reviews = [{"plate": "71-0001", "decision": "reviewed_suspicious", "start_ts": ms(d2, 0), "end_ts": ms(d2, 12)},
               {"plate": "71-0002", "decision": "reviewed_ok", "start_ts": ms(d2, 0), "end_ts": ms(d2, 23)},
               {"plate": "71-0001", "decision": "real_loss", "event_id": "q1", "start_ts": ms(d1, 0), "end_ts": ms(d1, 3)}]
    rows = {r["event"]["_id"]: (r["y"], r["w"]) for r in build_dataset(events, reviews)}
    assert rows == {"q1": (1, 1.0), "w2": (1, 0.5), "w3": (0, 0.5)}


def test_split_and_metrics():
    rows = [{"event": {"date_key": f"2026-10-{d:02d}"}, "y": y, "w": 1.0}
            for d in range(1, 11) for y in (1, 0)]
    train_rows, test_rows = split_by_day(rows)
    assert {r["event"]["date_key"] for r in test_rows} == {"2026-10-08", "2026-10-09", "2026-10-10"}
    assert len(train_rows) == 14
    p, r = precision_recall_at_k(test_rows, [1.0 if row["y"] else 0.0 for row in test_rows], k=1)
    assert (p, r) == (1.0, 1.0)
    p, r = precision_recall_at_k(test_rows, [0.0 if row["y"] else 1.0 for row in test_rows], k=1)
    assert (p, r) == (0.0, 0.0)


def test_train_skips_without_enough_labels():
    rows = [{"event": event(f"e{i}", date(2026, 10, 1)), "y": i % 2, "w": 1.0} for i in range(20)]
    assert train(rows, None, DEFAULTS, NOW)["status"] == "skipped"


def test_train_promotes_a_model_that_beats_the_rules():
    pytest.importorskip("sklearn")
    rng = random.Random(7)
    rows = []
    for d in range(40):
        day = date(2026, 9, 1) + timedelta(days=d)
        for i in range(25):          # more events than the top 20, so ranking matters
            loss = i < 3
            # the rules ignore repeat offenders; the label follows them, other evidence is random
            features = {"truck_confirmed_30d": 3 if loss else 0, "engine_off_share": rng.random(),
                        "night": rng.random() < 0.5, "rate_l_per_min": rng.uniform(0.2, 3.0)}
            rows.append({"event": event(f"{day}-{i}", day, start_h=i, **features), "y": int(loss), "w": 1.0})
    result = train(rows, None, DEFAULTS, NOW)
    assert result["status"] == "promoted"
    assert result["metrics"]["precision_at_20"] > result["metrics"]["active_precision_at_20"]
    model = result["model"]
    assert model["_id"] == "lr-2026-11-02" and model["active"] and len(model["coef"]) == len(model["features"])
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_train.py -q`
Expected: `ModuleNotFoundError: No module named 'train'`.

- [ ] **Step 3: Implement `scripts/fuel/train.py`**

```python
"""Model v2 training (spec §4.5) — scikit-learn, imported only by pipeline_fuel_train.

Labels:
  queue decisions   real_loss = 1, noise / legit = 0, weight 1 (follow_up and undecided ignored)
  old reviews       (fuel_drop_reviews without event_id, weight 0.5) — reviewed_ok / false_positive
                    windows make every overlapping event 0; a reviewed_suspicious window makes its
                    largest-excess overlapping event 1 (the others in that window stay unlabelled)
Evaluation: the most recent 30 % of labelled days are held out. precision@20 = share of each day's
top-20 ranked events that are real losses, averaged over days; recall = share of held-out real
losses ranked in their day's top 20. The new model replaces the active scorer (rules v1 or the
previous model) only when its precision@20 is higher and its recall is not lower.
"""
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

from model import FEATURES, feature_vector, predict
from plates import normalize_plate
from rules import SCORER_V1, score_v1

POSITIVE, NEGATIVE = {"real_loss"}, {"noise", "legit"}
OLD_OK, OLD_SUSPICIOUS = {"reviewed_ok", "false_positive"}, {"reviewed_suspicious"}
WEAK_WEIGHT = 0.5
MIN_PER_CLASS = 30
HOLDOUT_SHARE = 0.3
TOP_K = 20


def _utc(ms: float) -> datetime:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).replace(tzinfo=None)


def build_dataset(events: list[dict], reviews: list[dict]) -> list[dict]:
    """Rows {"event", "y", "w"}; queue decisions first, each event labelled at most once."""
    rows = [{"event": e, "y": int(e["decision"] in POSITIVE), "w": 1.0} for e in events
            if e.get("status") == "decided" and e.get("decision") in POSITIVE | NEGATIVE]
    per_plate = defaultdict(list)
    for e in events:
        if e.get("kind") != "refuel":
            per_plate[e["plate"]].append(e)
    for review in reviews:
        decision, plate = review.get("decision"), normalize_plate(review.get("plate"))
        if review.get("event_id") or decision not in OLD_OK | OLD_SUSPICIOUS or not plate:
            continue
        if review.get("start_ts") is None or review.get("end_ts") is None:
            continue
        start, end = _utc(review["start_ts"]), _utc(review["end_ts"])
        inside = [e for e in per_plate[plate] if e["start"] <= end and e["end"] >= start]
        if decision in OLD_OK:
            rows += [{"event": e, "y": 0, "w": WEAK_WEIGHT} for e in inside]
        elif inside:
            best = max(inside, key=lambda e: e["features"]["excess_over_burn_l"])
            rows.append({"event": best, "y": 1, "w": WEAK_WEIGHT})
    seen, out = set(), []
    for row in rows:
        if row["event"]["_id"] not in seen:
            seen.add(row["event"]["_id"])
            out.append(row)
    return out


def split_by_day(rows: list[dict], holdout_share: float = HOLDOUT_SHARE) -> tuple[list[dict], list[dict]]:
    days = sorted({r["event"]["date_key"] for r in rows})
    if len(days) < 2:
        return rows, []
    test_days = set(days[-max(1, round(len(days) * holdout_share)):])
    return ([r for r in rows if r["event"]["date_key"] not in test_days],
            [r for r in rows if r["event"]["date_key"] in test_days])


def precision_recall_at_k(rows: list[dict], scores: list[float], k: int = TOP_K) -> tuple[float, float]:
    per_day = defaultdict(list)
    for row, score in zip(rows, scores):
        per_day[row["event"]["date_key"]].append((score, row["y"]))
    precisions, hits, positives = [], 0, 0
    for items in per_day.values():
        top = sorted(items, key=lambda item: item[0], reverse=True)[:k]
        precisions.append(sum(y for _, y in top) / len(top))
        hits += sum(y for _, y in top)
        positives += sum(y for _, y in items)
    precision = float(np.mean(precisions)) if precisions else 0.0
    recall = hits / positives if positives else 0.0
    return round(precision, 4), round(recall, 4)


def rules_scores(rows: list[dict], settings: dict) -> list[float]:
    return [score_v1(r["event"]["class"], r["event"]["features"], settings) / 100 for r in rows]


def model_scores(model: dict, rows: list[dict]) -> list[float]:
    return [predict(model, r["event"]["features"])[0] for r in rows]


def fit(rows: list[dict]) -> dict:
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    X = np.array([feature_vector(r["event"]["features"]) for r in rows])
    y = np.array([r["y"] for r in rows])
    w = np.array([r["w"] for r in rows])
    scaler = StandardScaler().fit(X)
    clf = LogisticRegression(C=1.0, class_weight="balanced", max_iter=2000)
    clf.fit(scaler.transform(X), y, sample_weight=w)
    return {"features": FEATURES, "coef": clf.coef_[0].tolist(), "intercept": float(clf.intercept_[0]),
            "scaler_mean": scaler.mean_.tolist(), "scaler_scale": scaler.scale_.tolist()}


def train(rows: list[dict], active_model: dict | None, settings: dict, now: datetime) -> dict:
    positives = sum(r["y"] for r in rows)
    report = {"n_labels": len(rows), "positives": positives, "negatives": len(rows) - positives}
    if positives < MIN_PER_CLASS or report["negatives"] < MIN_PER_CLASS:
        return {**report, "status": "skipped", "reason": f"needs ≥ {MIN_PER_CLASS} labels of each kind"}
    train_rows, test_rows = split_by_day(rows)
    if not test_rows or not any(r["y"] for r in test_rows) or not any(r["y"] for r in train_rows):
        return {**report, "status": "skipped", "reason": "held-out days need real losses on both sides"}
    params = fit(train_rows)
    version = f"lr-{now:%Y-%m-%d}"
    new_p, new_r = precision_recall_at_k(test_rows, model_scores({**params, "version": version}, test_rows))
    if active_model:
        current, compared_with = model_scores(active_model, test_rows), active_model["version"]
    else:
        current, compared_with = rules_scores(test_rows, settings), SCORER_V1
    cur_p, cur_r = precision_recall_at_k(test_rows, current)
    promote = new_p > cur_p and new_r >= cur_r
    metrics = {"precision_at_20": new_p, "recall_at_20": new_r, "active_precision_at_20": cur_p,
               "active_recall_at_20": cur_r, "compared_with": compared_with,
               "train_days": len({r["event"]["date_key"] for r in train_rows}),
               "test_days": len({r["event"]["date_key"] for r in test_rows})}
    model_doc = {"_id": version, "version": version, "created_at": now, "active": promote,
                 "algo": "logistic_regression", **params, "metrics": metrics, "n_labels": len(rows)}
    return {**report, "status": "promoted" if promote else "kept", "metrics": metrics, "model": model_doc}
```

- [ ] **Step 4: Implement `scripts/fuel/pipeline_fuel_train.py`**

```python
"""fuel_train (2nd of the month, 03:30 BKK) — train model v2 on queue decisions (+ old reviews as weak
labels) and promote it only if it beats the active scorer (spec §4.5). Skips while there are fewer
than 30 labels of each kind; the report lands in etl_jobs either way."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from events_store import EVENTS, MODELS, load_active_model  # noqa: E402
from fuel_settings import load_settings  # noqa: E402
from train import build_dataset, train  # noqa: E402

LOOKBACK_DAYS = 365
EVENT_FIELDS = {"plate": 1, "date_key": 1, "start": 1, "end": 1, "kind": 1, "class": 1,
                "status": 1, "decision": 1, "features": 1}


def main() -> None:
    job = JobLog("fuel_train", "fuel_train")
    try:
        db = MongoClient(MONGODB_URI)["analytics"]
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        since = (now - timedelta(days=LOOKBACK_DAYS)).date().isoformat()
        events = list(db[EVENTS].find({"date_key": {"$gte": since}}, EVENT_FIELDS))
        reviews = list(db["fuel_drop_reviews"].find({}, {"plate": 1, "decision": 1, "start_ts": 1,
                                                         "end_ts": 1, "event_id": 1}))
        result = train(build_dataset(events, reviews), load_active_model(db), load_settings(db), now)
        model = result.pop("model", None)
        if model:
            if model["active"]:
                db[MODELS].update_many({"active": True}, {"$set": {"active": False}})
            db[MODELS].replace_one({"_id": model["_id"]}, model, upsert=True)
        metrics = result.pop("metrics", {})
        log.info("fuel_train: %s %s", result, metrics)
        job.finish("success", **result, **metrics)
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Add the dependency, register and schedule**

- `requirements.txt`: add a line `scikit-learn` (Render installs it; only `fuel_train` imports it).
- `requirements-dev.txt`: add a line `scikit-learn`.
- `routes/pipeline/pipeline_routes.py`, after each `"fuel_places"` line:
  - `PIPELINE_SCRIPTS`: `    "fuel_train": SCRIPTS_DIR / "fuel" / "pipeline_fuel_train.py",`
  - `PIPELINE_NAMES`: `                  "fuel_train": "fuel_train",`
  - `RUN_LOG_LOCATION`: `    "fuel_train": ("analytics", "etl_jobs"),`
- `main.py`, directly after the `sched_fuel_places` line:
```python
    # fuel_train — 2nd of each month 03:30 BKK → day 1, 20:30 UTC (after the Besttech pull, before fuel_nightly)
    scheduler.add_job(_run, CronTrigger(day=1, hour=20, minute=30), args=["fuel_train"], id="sched_fuel_train")  # 2nd 03:30 BKK
```

- [ ] **Step 6: Run the tests and checks**

```bash
.venv/bin/python -m pytest scripts/fuel/tests/test_train.py -q
grep -c '"fuel_train"' routes/pipeline/pipeline_routes.py
.venv/bin/python -m py_compile main.py routes/pipeline/pipeline_routes.py scripts/fuel/pipeline_fuel_train.py && echo ok
.venv/bin/python -m pytest -q -p no:cacheprovider | tail -1
```
Expected: `4 passed`; `3`; `ok`; the whole project suite passes (Part 1 fuel + Part 2 fuel + the existing `tests/` finance suite).

- [ ] **Step 7: Commit**

```bash
git checkout -- __pycache__/database.cpython-314.pyc 2>/dev/null
git add scripts/fuel/train.py scripts/fuel/pipeline_fuel_train.py scripts/fuel/tests/test_train.py requirements.txt requirements-dev.txt routes/pipeline/pipeline_routes.py main.py
git commit -m "feat(fuel): monthly fuel_train — logistic regression, promoted only when it beats the active scorer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Smoke on real data (⚠️ PROD, gated)

No code. Each step writes to production Mongo or calls Besttech — ask the user before each.

- [ ] **Step 1: ⚠️ PROD (1 Besttech call) — places**

```bash
.venv/bin/python scripts/fuel/pipeline_fuel_places.py 2>&1 | tail -2
.venv/bin/python - <<'EOF'
import sys; sys.path.insert(0, "scripts/engineon")
from collections import Counter
from common import MONGODB_URI
from pymongo import MongoClient
db = MongoClient(MONGODB_URI)["analytics"]
print(Counter(p["kind"] for p in db.fuel_places.find({}, {"kind": 1})))
print(db.etl_jobs.find_one({"job_type": "fuel_places"}, sort=[("created_at", -1)], projection={"_id": 0, "status": 1, "plants": 1, "besttech_pois": 1, "besttech_error": 1}))
EOF
```
Expected: ~370 `plant` places and the Besttech POIs (or a recorded `besttech_error` — plants still written).

- [ ] **Step 2: ⚠️ PROD — events for a day that already has gps_series (2026-10-05 from the Part 1 smokes)**

```bash
time env START_DATE=05/10/2026 END_DATE=05/10/2026 .venv/bin/python scripts/fuel/pipeline_fuel_events.py 2>&1 | tail -2
.venv/bin/python - <<'EOF'
import sys; sys.path.insert(0, "scripts/engineon")
from collections import Counter
from common import MONGODB_URI
from pymongo import MongoClient
db = MongoClient(MONGODB_URI)["analytics"]
ev = list(db.fuel_events.find({"date_key": "2026-10-05"}, {"features": 0}))
print(len(ev), Counter(e["class"] for e in ev), Counter(e["status"] for e in ev))
for e in sorted(ev, key=lambda e: -e["p_real_loss"] * e["litres"])[:5]:
    print(e["_id"], e["class"], e["litres"], e["score"], e["reasons"], e["driver"])
s = db.fuel_daily_summary.find_one({"_id": "2026-10-05"}); s.pop("updated_at")
print(s)
EOF
```
Expected: the run takes well under a minute (~17 ms per truck-day); classes are mostly `consumption` / `noise`; a handful of `suspected_loss` at most, each with three Thai reasons; the summary's `by_status` adds up to `trucks_expected`. Report the numbers and the top five to the user.

- [ ] **Step 3: Not without the user — training labels from old reviews**

The user declined backfills. Note: if the planned `purge_driving_log.py` (mongo-maintenance) has run, Terminus raw data starts 2026-04-01 and March review windows have nothing left. If they later agree: run Part 1's `scripts/fuel/backfill_terminus_reviews.py` (~716 Terminus truck-days, minutes), then `fuel_events` for those dates (`START_DATE`/`END_DATE` per window) so `fuel_train` can use the weak labels. Until then `fuel_train` reports `skipped` until the queue has ≥ 30 decisions of each kind.

---

## After Part 2 (needs the user's approval — not part of these tasks)

1. Final whole-branch review of `feat/fuel-events`.
2. Merge order: `feat/fuel-gps-series` first, then `feat/fuel-events`, then push `main` → Render deploys (installs scikit-learn).
3. Watch the first night's `etl_jobs`: `fuel_nightly` now records `events`; `fuel_places` on Monday; `fuel_train` on the 2nd.
