# Fuel Redesign Part 4 — Jobs Tab (งานประจำ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A งานประจำ tab on fuel-control-center `/pipeline` where the fuel team runs overspeed, CPAC RMC compensation, engine-on (with the new `ENGINE_LOGIC`) and the four fuel-series jobs with parameters, sees each job's fixed schedule and its last 5 runs — backed by two new api-ncac pipelines that replace the hand-run overspeed script and the Mac launchd RMC job.

**Architecture:** api-ncac gets `scripts/overspeed/` and `scripts/rmc/`, each a pure, unit-tested logic module plus a pipeline script that follows the engine-on conventions (env parameters from the `POST /pipeline/run/{type}` body, `JobLog` → `analytics.etl_jobs`, sibling imports through `sys.path`); engine-on gains an `ENGINE_LOGIC` parameter; both new pipelines are registered and scheduled in code. fuel-control-center gets one pure module (`src/lib/pipeline-jobs.ts`: job catalog, validation, payload builder, proxy allow-lists) shared by the proxy route and the tab; the proxy requires a next-auth session for every POST; the tab renders one card per catalog entry and feeds the page's existing single-runner queue.

**Tech Stack:** Python 3.14 locally / Render's Python with `requirements.txt` (pandas, numpy, requests, pymongo, openpyxl — all present already), pytest; Next.js 16, React 19, next-auth 4, Tailwind; Node 25 `node --test` with TypeScript type stripping (erasable TS only in tested modules).

**Spec:** `docs/superpowers/specs/2026-10-06-fuel-detection-redesign-design.md` §10 (commit `67d8a2a`, this repo). Read it alongside this plan.

## Global Constraints

- Worktrees only: api-ncac → `~/Documents/project/ncac/api-ncac-jobs` (branch `feat/jobs-tab` from local `main` 213e77e); fuel-control-center → `~/Documents/project/fuel-control-center/fcc-jobs` (branch `feat/jobs-tab` from local `main` 67d8a2a). No pushes, no merges, no edits in the main checkouts or any other worktree.
- api-ncac is a **public** GitHub repo: no vehicle mapping, driver names, endpoint URLs, keys or passwords in git. The Mongo password typed into `etl_overspeed_v4.py` is never copied anywhere — the job uses `MONGODB_URI`.
- Never `git add -A`; add exact paths. pytest rewrites tracked `.pyc` files in api-ncac: run it with `PYTHONDONTWRITEBYTECODE=1` and restore any modified `.pyc` (`git diff --name-only -- '*.pyc' | xargs git checkout --`) before committing.
- fuel-control-center: `node_modules` is a symlink to the main checkout's — never `npm install`; run Turbopack (`next build` / `next dev`) only in an APFS clone (`cp -c -R`).
- `main.py` `CronTrigger` hours are UTC (BKK − 7). Schedules are fixed in code: overspeed `hour=21, minute=30` (04:30 BKK), rmc_compensation `hour=2, minute=0` (09:00 BKK). Registry entries go at the end of `PIPELINE_SCRIPTS` / `PIPELINE_NAMES` / `RUN_LOG_LOCATION` (after `atms_stockmovement_light`); cron lines after the `sched_atms_stockmovement_light` line.
- api-ncac turns every body key into an UPPERCASE env var of the script. The proxy forwards only the type's allow-listed keys (on top of `STRIP_KEYS`); every Run on both tabs needs a next-auth session; status reads stay open.
- UI validation before sending: end ≥ start; ≤ 7 days per run for `driving_log` readers (overspeed, engine-on, fuel_series_terminus), ≤ 3 for fuel_series_besttech, ≤ 14 for RMC; `DATE` or `START`+`END`, not both; numbers are positive integers. Dates: dd/mm/YYYY for overspeed / engine-on / fuel series, YYYY-MM-DD for RMC and fuel_tanks.
- Smoke runs touch production only through scratch collections or `DRY_RUN`: overspeed → `OVERSPEED_COLLECTION=overspeed_smoke` (never `analytics.overspeed`); RMC → `DRY_RUN=true` (no push to `API_PUSH`, no state); engine-on v2 → `ENGINEON_RAW_COLLECTION` / `ENGINEON_SUMMARY_COLLECTION` = `*_smoke` (never `raw_engineon` / `summary_engineon`); `analytics.rmc_vehicles` is seeded once; `analytics.etl_state` is not seeded (a cutover step for the user); no Besttech calls; Mongo reads small and indexed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A stricter overspeed re-run (e.g. `MIN_RECORDS` 10 after 5) must remove that day's old rows for every plate it processed, including plates left with no segment — Task 2 `test_day_replaces_rows_for_every_processed_plate`.
- A CPAC day whose trips all fail the vehicle mapping must fail and keep the state where it was (the bug that silently lost 32 days) — Task 3 `test_zero_rows_after_mapping_is_an_error`, `test_run_days_advances_state_only_after_each_pushed_day`.
- Body keys other than the job's own parameters (e.g. `mongodb_uri`, `engineon_raw_collection`, `overspeed_collection`) must never reach api-ncac as env vars — Task 7 `proxy allow-list keeps known keys only (old ETL buttons included)`.
- A bad parameter sent straight to the API (bypassing the form) must show up as a failed run on the card, not as "Pipeline did not start" — Task 2 and Task 4 `test_bad_parameters_are_logged_as_a_failed_run`.
- An engine-on range across a month boundary must queue a trip-summary rebuild for every month touched, and a run without dates must rebuild yesterday's (Bangkok) month — Task 7 `engine-on v2 queues a trip-summary rebuild for every month touched`, `date helpers`.

---

## Part A — api-ncac (`~/Documents/project/ncac/api-ncac-jobs`)

Test command used throughout (from the worktree root):

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest <paths> -q -p no:cacheprovider
```

The worktree already has `.venv` (`requirements.txt` + `requirements-dev.txt` installed) and `scripts/.env` (gitignored; `MONGODB_URI`, `POST_URL`, `API_PUSH`).

### Task 1: Overspeed segment builder

Port of `build_segments()` from `~/Documents/project/schedule_fuel/cal_overspeed/etl_overspeed_v4.py` — read the old file for logic only and copy nothing from it (it holds a password). Notes:
- Spec §10.2 says Terminus `ระยะทาง(กม.)` is always 0. It is not always 0 (the latest `analytics.overspeed` row has `sum_distance_km` 3.14), so the port keeps the pandas semantics exactly: `w_speed` = distance-weighted mean speed, `None` when the segment's distance sum is not > 0 (zero, or NaN anywhere in it).
- Non-numeric speed / distance values are coerced to NaN instead of crashing the day.

**Files:**
- Modify: `requirements-dev.txt` (pandas, openpyxl for the new tests)
- Create: `scripts/overspeed/overspeed_segments.py`
- Create: `scripts/overspeed/tests/conftest.py`
- Test: `scripts/overspeed/tests/test_overspeed_segments.py`

**Interfaces:**
- Produces: `PLATE`, `SPEED`, `DIST` (driving_log column names), `OUTPUT_FIELDS`; `frame_from_rows(rows: list[dict]) -> pd.DataFrame` (sorted, with a `datetime` column); `build_segments(df, condition, speed_label, gap_minutes, min_duration_min, min_records) -> pd.DataFrame`; `plate_segments(g, gap_minutes=2, min_duration_min=2, min_records=5) -> list[dict]` (Mongo-ready, both groups, by start time; naive Thai-time datetimes).

- [ ] **Step 1: Dev requirements and test path**

```diff
--- a/requirements-dev.txt
+++ b/requirements-dev.txt
@@ -1,5 +1,8 @@
-# Local test/run env for scripts/fuel on macOS — Render installs requirements.txt only
+# Local test/run env for scripts/fuel, overspeed, rmc and engineon tests on macOS — Render installs
+# requirements.txt only
 numpy
+pandas
+openpyxl
 pymongo
 requests
 python-dotenv
```

Apply from the worktree root with `git apply` (or make the same edit by hand), then:

```python file=scripts/overspeed/tests/conftest.py
import sys
from pathlib import Path

# Pipeline scripts import their siblings by module name (they run as files), so tests do the same.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

- [ ] **Step 2: Write the failing tests**

```python file=scripts/overspeed/tests/test_overspeed_segments.py
from datetime import datetime, timedelta

import pytest

from overspeed_segments import OUTPUT_FIELDS, PLATE, frame_from_rows, plate_segments


def readings(plate, start, speeds, step_s=30, dist=0.25):
    t0 = datetime.strptime(f"05/10/2026 {start}", "%d/%m/%Y %H:%M:%S")
    out = []
    for i, speed in enumerate(speeds):
        t = t0 + timedelta(seconds=step_s * i)
        out.append({PLATE: plate, "วันที่": t.strftime("%d/%m/%Y"), "เวลา": t.strftime("%H:%M:%S"),
                    "ความเร็ว(กม./ชม.)": speed, "ระยะทาง(กม.)": dist})
    return out


def segs(rows, **kw):
    df = frame_from_rows(rows)
    return plate_segments(df[df[PLATE] == rows[0][PLATE]], **kw)


def test_both_speed_groups_become_segments():
    out = segs(readings("71-0001", "08:00:00", [75] * 10 + [65] * 10))
    assert [s["speed_group"] for s in out] == [">70", "60-70"]
    first = out[0]
    assert set(first) == set(OUTPUT_FIELDS)
    assert first["vehicle"] == "71-0001" and first["records"] == 10
    assert first["start_datetime"] == datetime(2026, 10, 5, 8, 0, 0)
    assert first["end_datetime"] == datetime(2026, 10, 5, 8, 4, 30)
    assert first["duration_minutes"] == pytest.approx(4.5)
    assert first["avg_speed"] == 75 and first["max_speed"] == 75


def test_gap_longer_than_two_minutes_splits():
    rows = readings("71-0001", "08:00:00", [80] * 8) + readings("71-0001", "08:09:00", [80] * 8)
    out = segs(rows)
    assert len(out) == 2 and [s["segment_id"] for s in out] == [1, 2]


def test_short_or_sparse_runs_are_dropped():
    assert segs(readings("71-0001", "08:00:00", [80] * 4)) == []                 # 4 records < 5
    assert segs(readings("71-0001", "08:00:00", [80] * 6, step_s=10)) == []      # 50 s ≤ 2 min


def test_distance_weighting_matches_old_script():
    weighted = segs(readings("71-0001", "08:00:00", [72, 72, 72, 90, 90, 90], step_s=60, dist=1.0))[0]
    assert weighted["sum_distance_km"] == pytest.approx(6.0) and weighted["w_speed"] == pytest.approx(81.0)
    zero = segs(readings("71-0001", "08:00:00", [80] * 6, step_s=60, dist=0.0))[0]
    assert zero["sum_distance_km"] == 0 and zero["w_speed"] is None
    rows = readings("71-0001", "08:00:00", [80] * 6, step_s=60, dist=1.0)
    rows[2]["ระยะทาง(กม.)"] = float("nan")                                      # one missing distance
    gappy = segs(rows)[0]
    assert gappy["sum_distance_km"] == pytest.approx(5.0) and gappy["w_speed"] is None


def test_frame_from_rows_drops_bad_rows_and_sorts():
    rows = readings("71-0002", "09:00:00", [61, 62]) + readings("71-0001", "08:00:00", [61])
    rows.append({PLATE: None, "วันที่": "05/10/2026", "เวลา": "08:00:00", "ความเร็ว(กม./ชม.)": 70, "ระยะทาง(กม.)": 0})
    rows.append({PLATE: "71-0003", "วันที่": "05/10/2026", "เวลา": "bad", "ความเร็ว(กม./ชม.)": "70", "ระยะทาง(กม.)": 0})
    df = frame_from_rows(rows)
    assert list(df[PLATE]) == ["71-0001", "71-0002", "71-0002"]
    assert frame_from_rows([]).empty
```

- [ ] **Step 3: Run them to verify they fail**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/overspeed -q -p no:cacheprovider`
Expected: collection error `ModuleNotFoundError: No module named 'overspeed_segments'`

- [ ] **Step 4: Implement**

```python file=scripts/overspeed/overspeed_segments.py
"""Overspeed segments for one plate-day (spec §10.2).

A faithful port of schedule_fuel/cal_overspeed/etl_overspeed_v4.py `build_segments()` with its
parameters made explicit, so /overspeed keeps reading exactly the same fields: readings that meet a
speed condition are grouped into segments wherever two of them are more than `gap_minutes` apart;
a segment is kept when it lasts more than `min_duration_min` and has at least `min_records` readings.
Datetimes stay naive Thai local time, as the old script stored them.
"""
import numpy as np
import pandas as pd

PLATE = "ทะเบียนพาหนะ"
SPEED = "ความเร็ว(กม./ชม.)"
DIST = "ระยะทาง(กม.)"
GROUPS = (
    (">70", lambda s: s > 70),
    ("60-70", lambda s: (s >= 60) & (s <= 70)),
)
OUTPUT_FIELDS = ["segment_id", "vehicle", "start_datetime", "end_datetime", "duration_minutes",
                 "sum_distance_km", "records", "avg_speed", "max_speed", "w_speed", "speed_group"]


def frame_from_rows(rows: list[dict]) -> pd.DataFrame:
    """driving_log rows (plate, วันที่, เวลา, speed, distance) → sorted frame with a `datetime` column."""
    if not rows:
        return pd.DataFrame(columns=[PLATE, "datetime", SPEED, DIST])
    df = pd.DataFrame(rows)
    for col in (SPEED, DIST):
        df[col] = pd.to_numeric(df.get(col), errors="coerce")
    df["datetime"] = pd.to_datetime(df["วันที่"].astype(str) + " " + df["เวลา"].astype(str),
                                    format="%d/%m/%Y %H:%M:%S", errors="coerce")
    df = df.dropna(subset=["datetime"])
    df = df[df[PLATE].apply(lambda p: isinstance(p, str) and bool(p.strip()))]
    return df.sort_values([PLATE, "datetime"]).reset_index(drop=True)


def build_segments(df: pd.DataFrame, condition, speed_label: str, gap_minutes: float,
                   min_duration_min: float, min_records: int) -> pd.DataFrame:
    d = df.loc[condition].copy()
    if d.empty:
        return pd.DataFrame()
    d["dt_diff"] = d["datetime"].diff()
    d["segment_id"] = ((d["dt_diff"] > pd.Timedelta(minutes=gap_minutes)) | d["dt_diff"].isna()).cumsum()
    seg = d.groupby("segment_id", as_index=False).agg(
        vehicle=(PLATE, "first"),
        start_datetime=("datetime", "min"),
        end_datetime=("datetime", "max"),
        duration_minutes=("datetime", lambda x: (x.max() - x.min()).total_seconds() / 60),
        sum_distance_km=(DIST, "sum"),
        records=("datetime", "count"),
        avg_speed=(SPEED, "mean"),
        max_speed=(SPEED, "max"),
        w_speed=(SPEED, lambda x: np.average(x, weights=df.loc[x.index, DIST])
                 if df.loc[x.index, DIST].sum() > 0 else None),
    )
    seg = seg[(seg["duration_minutes"] > min_duration_min) & (seg["records"] >= min_records)]
    if seg.empty:
        return pd.DataFrame()
    seg["speed_group"] = speed_label
    return seg


def plate_segments(g: pd.DataFrame, gap_minutes: float = 2, min_duration_min: float = 2,
                   min_records: int = 5) -> list[dict]:
    """All overspeed segments of one plate-day as Mongo-ready dicts (both speed groups, by start time)."""
    parts = [build_segments(g, cond(g[SPEED]), label, gap_minutes, min_duration_min, min_records)
             for label, cond in GROUPS]
    parts = [p for p in parts if not p.empty]
    if not parts:
        return []
    out = pd.concat(parts, ignore_index=True).sort_values("start_datetime").reset_index(drop=True)
    out = out.astype(object).where(pd.notnull(out), None)
    records = out[OUTPUT_FIELDS].to_dict("records")
    for rec in records:
        for key in ("start_datetime", "end_datetime"):
            rec[key] = pd.Timestamp(rec[key]).to_pydatetime()
        rec["segment_id"] = int(rec["segment_id"])
        rec["records"] = int(rec["records"])
        for key in ("duration_minutes", "sum_distance_km", "avg_speed", "max_speed", "w_speed"):
            if rec[key] is not None:
                rec[key] = float(rec[key])
    return records
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/overspeed -q -p no:cacheprovider`
Expected: `5 passed`

- [ ] **Step 6: Commit**

```bash
git add requirements-dev.txt scripts/overspeed/overspeed_segments.py scripts/overspeed/tests/conftest.py scripts/overspeed/tests/test_overspeed_segments.py
git commit -m "feat(overspeed): segment builder ported from etl_overspeed_v4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Overspeed pipeline (`overspeed`)

Reads one day at a time from `terminus.driving_log` through the `วันที่`-first index `idx_date_plate_status_order_desc` (only the five fields the segments need), 50 plates per batch with a 0.5 s pause (the cluster is small). ⚠️ `ความเร็ว(กม./ชม.)` and `ระยะทาง(กม.)` contain dots: in a projection, filter or sort Mongo reads a dotted name as a nested path and returns nothing, so the read is an aggregation that takes them with `$getField` (Mongo ≥ 5.0; the cluster runs 8.0), and a batch whose rows all lack speed fails instead of replacing the day. The test fake applies Mongo's dotted-path semantics so a plain projection would fail the tests. For every batch it deletes that day's `analytics.overspeed` rows of each plate it processed, then inserts the new segments — so a stricter re-run leaves no stale rows. `OVERSPEED_COLLECTION` redirects the writes for smoke tests and must be `overspeed` or `overspeed_*`. `JobLog` is created before the parameters are parsed, so a bad parameter is a failed run on the card.

**Files:**
- Create: `scripts/overspeed/pipeline_overspeed.py`
- Test: `scripts/overspeed/tests/test_pipeline_overspeed.py`

**Interfaces:**
- Consumes: Task 1 `PLATE`, `frame_from_rows`, `plate_segments`; `scripts/engineon/common.py` `MONGODB_URI`, `JobLog(job_type, pipeline, meta)`, `.finish(status, **extra)`, `log`, `yesterday_bkk()`; `scripts/fuel/dates.py` `ddmmyyyy(day)`, `parse_days(start, end)`; `scripts/fuel/plates.py` `terminus_plate(plate)`.
- Produces: env `START_DATE`, `END_DATE` (dd/mm/YYYY), `PLATES`, `MIN_DURATION_MIN`, `MIN_RECORDS`, `GAP_MINUTES`, `OVERSPEED_COLLECTION`; `read_rows(driving_log, key, plates) -> list[dict]`; `overspeed_day(driving_log, target, day, plates=None, gap_minutes=2, min_duration_min=2, min_records=5, batch_pause_s=0.5) -> {"day", "plates", "segments", "deleted"}`; `run_params(env, yesterday) -> dict`; JobLog `job_type` = `pipeline` = `"overspeed"`.

- [ ] **Step 1: Write the failing tests**

```python file=scripts/overspeed/tests/test_pipeline_overspeed.py
from datetime import date, datetime

import pytest

import pipeline_overspeed
from pipeline_overspeed import day_plates, overspeed_day, run_params
from test_overspeed_segments import readings

DAY = date(2026, 10, 5)


MISSING = object()


def mongo_path(doc, name):
    """Mongo reads a projected name as a path: "a.b" means doc["a"]["b"] — so a name with dots in it
    (ความเร็ว(กม./ชม.), ระยะทาง(กม.)) finds nothing."""
    value = doc
    for part in name.split("."):
        if not isinstance(value, dict) or part not in value:
            return MISSING
        value = value[part]
    return value


def project(doc, spec):
    out = {}
    for name, how in spec.items():
        if name == "_id":
            continue
        value = doc.get(how["$getField"], MISSING) if isinstance(how, dict) else mongo_path(doc, name)
        if value is not MISSING:
            out[name] = value
    return out


class FakeCursor(list):
    def hint(self, _index):
        return self


class FakeDrivingLog:
    """terminus.driving_log with Mongo's projection semantics for dotted names."""

    def __init__(self, rows):
        self.rows, self.matches, self.hints = rows, [], []

    def distinct(self, field, query):
        return [r[field] for r in self.rows if r["วันที่"] == query["วันที่"]] + [None, "  "]

    def _match(self, query):
        wanted = set(query["ทะเบียนพาหนะ"]["$in"])
        return [r for r in self.rows if r["วันที่"] == query["วันที่"] and r["ทะเบียนพาหนะ"] in wanted]

    def find(self, query, projection):
        self.matches.append(query)
        return FakeCursor(project(r, projection) for r in self._match(query))

    def aggregate(self, pipeline, hint=None):
        match, spec = pipeline[0]["$match"], pipeline[1]["$project"]
        self.matches.append(match)
        self.hints.append(hint)
        return iter([project(r, spec) for r in self._match(match)])


class DeleteResult:
    deleted_count = 3


class FakeTarget:
    def __init__(self):
        self.deletes, self.inserts = [], []

    def delete_many(self, query):
        self.deletes.append(query)
        return DeleteResult()

    def insert_many(self, docs):
        self.inserts += docs


def test_day_replaces_rows_for_every_processed_plate():
    rows = readings("71-0001", "08:00:00", [80] * 10) + readings("71-0002", "08:00:00", [40] * 10)
    target = FakeTarget()
    stats = overspeed_day(FakeDrivingLog(rows), target, DAY, batch_pause_s=0)
    assert stats == {"day": "2026-10-05", "plates": 2, "segments": 1, "deleted": 3}
    delete = target.deletes[0]
    assert delete["vehicle"] == {"$in": ["71-0001", "71-0002"]}          # 71-0002 has no segment any more
    assert delete["start_datetime"] == {"$gte": datetime(2026, 10, 5), "$lt": datetime(2026, 10, 6)}
    assert [d["vehicle"] for d in target.inserts] == ["71-0001"]



def test_speed_and_distance_are_read_despite_the_dots_in_their_names():
    log = FakeDrivingLog(readings("71-0001", "08:00:00", [80] * 10))
    target = FakeTarget()
    overspeed_day(log, target, DAY, batch_pause_s=0)
    assert target.inserts[0]["max_speed"] == 80
    assert target.inserts[0]["sum_distance_km"] == pytest.approx(2.5)
    assert log.hints == ["idx_date_plate_status_order_desc"]


def test_rows_without_speed_fail_instead_of_wiping_the_day():
    rows = [{k: v for k, v in r.items() if k != "ความเร็ว(กม./ชม.)"}
            for r in readings("71-0001", "08:00:00", [80] * 10)]
    target = FakeTarget()
    with pytest.raises(RuntimeError, match="without speed"):
        overspeed_day(FakeDrivingLog(rows), target, DAY, batch_pause_s=0)
    assert target.deletes == [] and target.inserts == []


def test_plates_filter_accepts_either_plate_form():
    log = FakeDrivingLog(readings("71-0001", "08:00:00", [80] * 10))
    overspeed_day(log, FakeTarget(), DAY, plates=["สบ.71-0001"], batch_pause_s=0)
    assert log.matches[0]["ทะเบียนพาหนะ"] == {"$in": ["71-0001"]}


def test_day_without_rows_deletes_nothing():
    target = FakeTarget()
    assert overspeed_day(FakeDrivingLog([]), target, DAY, batch_pause_s=0)["plates"] == 0
    assert target.deletes == [] and target.inserts == []


def test_day_plates_skips_vendor_nulls():
    assert day_plates(["71-0002", None, "  ", "71-0001", 7]) == ["71-0001", "71-0002"]


def test_run_params_defaults_and_validation():
    p = run_params({}, "05/10/2026")
    assert p["days"] == [DAY] and p["plates"] is None and p["target"] == "overspeed"
    assert (p["gap_minutes"], p["min_duration_min"], p["min_records"]) == (2.0, 2.0, 5)
    p = run_params({"START_DATE": "01/10/2026", "END_DATE": "02/10/2026", "PLATES": "71-0001, 71-0002",
                    "MIN_RECORDS": "8", "OVERSPEED_COLLECTION": "overspeed_smoke"}, "05/10/2026")
    assert len(p["days"]) == 2 and p["plates"] == ["71-0001", "71-0002"] and p["min_records"] == 8
    with pytest.raises(ValueError):
        run_params({"OVERSPEED_COLLECTION": "raw_engineon"}, "05/10/2026")
    with pytest.raises(ValueError):
        run_params({"GAP_MINUTES": "0"}, "05/10/2026")


class FakeJob:
    def __init__(self, job_type, pipeline, meta=None):
        self.meta, self.finished = meta, []

    def finish(self, status="success", **extra):
        self.finished.append((status, extra))


def test_bad_parameters_are_logged_as_a_failed_run(monkeypatch):
    jobs = []
    monkeypatch.setattr(pipeline_overspeed, "JobLog", lambda *a: jobs.append(FakeJob(*a)) or jobs[-1])
    monkeypatch.setenv("MIN_RECORDS", "0")
    with pytest.raises(ValueError, match="MIN_RECORDS"):
        pipeline_overspeed.main()
    assert jobs[0].meta["min_records"] == "0"
    assert jobs[0].finished[0][0] == "failed" and "MIN_RECORDS" in jobs[0].finished[0][1]["error"]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/overspeed -q -p no:cacheprovider`
Expected: collection error `ModuleNotFoundError: No module named 'pipeline_overspeed'`

- [ ] **Step 3: Implement**

```python file=scripts/overspeed/pipeline_overspeed.py
"""overspeed — Terminus driving_log → analytics.overspeed (spec §10.2), port of etl_overspeed_v4.py.

Default day = yesterday (Bangkok). Env (from POST /pipeline/run/overspeed or the Jobs tab):
START_DATE / END_DATE (dd/mm/YYYY), PLATES (comma list, "71-8623" or "สบ.71-8623"),
MIN_DURATION_MIN (2), MIN_RECORDS (5), GAP_MINUTES (2). OVERSPEED_COLLECTION redirects the writes
(smoke tests only; must be "overspeed" or start with "overspeed_").

Plates are read in batches of 50 through the วันที่-first index (only the five fields the segments
need; speed and distance through $getField because their names contain dots). For every batch the day's rows of each plate processed are deleted before the new segments are
inserted — including plates that no longer have a segment, so a stricter re-run leaves no stale rows.
"""
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS / "engineon"))
sys.path.insert(0, str(SCRIPTS / "fuel"))
from common import MONGODB_URI, JobLog, log, yesterday_bkk  # noqa: E402
from dates import ddmmyyyy, parse_days  # noqa: E402
from plates import terminus_plate  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from overspeed_segments import DIST, PLATE, SPEED, frame_from_rows, plate_segments  # noqa: E402

INDEX = "idx_date_plate_status_order_desc"
BATCH = 50
# "ความเร็ว(กม./ชม.)" and "ระยะทาง(กม.)" contain dots: in a projection, filter or sort Mongo reads a dotted
# name as a nested path and returns nothing, so they are read literally with $getField (Mongo >= 5.0).
PROJECT = {"_id": 0, PLATE: 1, "วันที่": 1, "เวลา": 1, "speed": {"$getField": SPEED}, "dist": {"$getField": DIST}}
TARGET_RE = re.compile(r"^overspeed(_[a-z0-9_]+)?$")
RUN_ENV = ("START_DATE", "END_DATE", "PLATES", "MIN_DURATION_MIN", "MIN_RECORDS", "GAP_MINUTES", "OVERSPEED_COLLECTION")


def day_plates(values) -> list[str]:
    """Distinct driving_log plates for a day without vendor nulls/blanks, sorted (values kept as stored)."""
    return sorted({v for v in values if isinstance(v, str) and v.strip()})


def read_rows(driving_log, key: str, plates: list[str]) -> list[dict]:
    """One day's driving_log rows of `plates`, only the fields the segments need, through the วันที่-first index."""
    rows = []
    for doc in driving_log.aggregate([{"$match": {"วันที่": key, PLATE: {"$in": plates}}}, {"$project": PROJECT}],
                                     hint=INDEX):
        doc[SPEED], doc[DIST] = doc.pop("speed", None), doc.pop("dist", None)
        rows.append(doc)
    return rows


def overspeed_day(driving_log, target, day: date, plates: list[str] | None = None, gap_minutes: float = 2,
                  min_duration_min: float = 2, min_records: int = 5, batch_pause_s: float = 0.5) -> dict:
    key = ddmmyyyy(day)
    if plates:
        raw = sorted({terminus_plate(p) for p in plates})
    else:
        raw = day_plates(driving_log.distinct(PLATE, {"วันที่": key}))
    day_start = datetime.combine(day, datetime.min.time())
    day_end = day_start + timedelta(days=1)
    stats = {"day": day.isoformat(), "plates": 0, "segments": 0, "deleted": 0}
    for i in range(0, len(raw), BATCH):
        part = raw[i:i + BATCH]
        df = frame_from_rows(read_rows(driving_log, key, part))
        if not df.empty and df[SPEED].isna().all():
            # never replace a day's rows from readings that lost their speed (e.g. a projection mistake)
            raise RuntimeError(f"{key}: driving_log rows came back without speed — overspeed rows left as they were")
        processed = sorted(df[PLATE].unique()) if not df.empty else []
        segments = []
        for _, g in df.groupby(PLATE):
            segments += plate_segments(g, gap_minutes, min_duration_min, min_records)
        if processed:
            deleted = target.delete_many({"vehicle": {"$in": processed},
                                          "start_datetime": {"$gte": day_start, "$lt": day_end}})
            stats["deleted"] += deleted.deleted_count
        if segments:
            target.insert_many(segments)
        stats["plates"] += len(processed)
        stats["segments"] += len(segments)
        if batch_pause_s and i + BATCH < len(raw):
            time.sleep(batch_pause_s)
    log.info("overspeed %s: %d plates, %d segments, %d old rows replaced",
             stats["day"], stats["plates"], stats["segments"], stats["deleted"])
    return stats


def positive_number(env: dict, name: str, default: float, cast=float):
    raw = env.get(name)
    if raw in (None, ""):
        return cast(default)
    value = cast(raw)
    if value <= 0:
        raise ValueError(f"{name} must be positive, got {raw}")
    return value


def run_params(env: dict, yesterday: str) -> dict:
    target = env.get("OVERSPEED_COLLECTION", "overspeed")
    if not TARGET_RE.match(target):
        raise ValueError(f"OVERSPEED_COLLECTION must be 'overspeed' or 'overspeed_*', got {target!r}")
    return {
        "days": parse_days(env.get("START_DATE") or yesterday, env.get("END_DATE") or yesterday),
        "plates": [p.strip() for p in env.get("PLATES", "").split(",") if p.strip()] or None,
        "gap_minutes": positive_number(env, "GAP_MINUTES", 2),
        "min_duration_min": positive_number(env, "MIN_DURATION_MIN", 2),
        "min_records": positive_number(env, "MIN_RECORDS", 5, int),
        "target": target,
    }


def main() -> None:
    env = dict(os.environ)
    # log first, so a bad parameter shows up as a failed run on the Jobs tab card
    job = JobLog("overspeed", "overspeed", {k.lower(): env[k] for k in RUN_ENV if env.get(k)})
    try:
        params = run_params(env, yesterday_bkk().strftime("%d/%m/%Y"))
        days = params.pop("days")
        target_name = params.pop("target")
        client = MongoClient(MONGODB_URI)
        driving_log = client["terminus"]["driving_log"]
        target = client["analytics"][target_name]
        per_day = [overspeed_day(driving_log, target, day, **params) for day in days]
        job.finish("success", start_date=ddmmyyyy(days[0]), end_date=ddmmyyyy(days[-1]), target=target_name,
                   records=sum(d["segments"] for d in per_day), deleted=sum(d["deleted"] for d in per_day),
                   days=per_day)
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/overspeed -q -p no:cacheprovider`
Expected: `13 passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/overspeed/pipeline_overspeed.py scripts/overspeed/tests/test_pipeline_overspeed.py
git commit -m "feat(overspeed): pipeline_overspeed — indexed day reads, replace per plate x day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: RMC transform and run rules

Port of `transform_data()` / `push_api()` conversions / the catch-up loop of `~/Documents/project/schedule_fuel/Cpac_compen/compensation_cpac/rmc_daily/rmc_daily.py`: same tiers (site minutes < 91 tier_0, 91–119 tier_1, 120–150 tier_2, > 150 tier_3, no times no_tier; ML 1/2/3, MS 0.5/1/1.5), the 2026-09-28 `.0` fix, plus the new guard (trips fetched but 0 rows to send → the day fails). A day with no trips at all sends nothing (the old script posted an empty list) and counts as done. The vehicle mapping comes in as a list of dicts (loaded from Mongo in Task 4). Test fixtures use made-up plates and names only.

**Files:**
- Create: `scripts/rmc/rmc_logic.py`
- Create: `scripts/rmc/tests/conftest.py`
- Test: `scripts/rmc/tests/test_rmc_logic.py`

**Interfaces:**
- Produces: `MAX_CATCHUP_DAYS = 14`, `ML`, `MS`, `RmcError`; `transform(raw: DataFrame, vehicles: list[dict]) -> DataFrame`; `payload(df) -> tuple[list[dict], int]` (rows, dropped); `check_sending(day, fetched, sending)`; `pending_days(last_success, today, cap=14) -> list[date]`; `run_mode(env) -> {"kind": "manual"|"catchup", "start", "end", "dry_run"}` (raises `ValueError`); `run_days(days, fetch, push, vehicles, dry_run=False, on_success=None) -> list[dict]` (per day: `day, fetched, dropped, rows, pushed, result`).

- [ ] **Step 1: Test path**

```python file=scripts/rmc/tests/conftest.py
import sys
from pathlib import Path

# Pipeline scripts import their siblings by module name (they run as files), so tests do the same.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

- [ ] **Step 2: Write the failing tests**

```python file=scripts/rmc/tests/test_rmc_logic.py
from datetime import date

import pandas as pd
import pytest

from rmc_logic import ML, MS, RmcError, check_sending, payload, pending_days, run_days, run_mode, transform

VEHICLES = [
    {"id": 1, "code": "6496", "plate_no": "71-6496 สบ.", "plate_no_only": "716496", "driver_name": "A",
     "driver_id": 10, "device_types_id": 2},
    {"id": 2, "code": "7001", "plate_no": "71-8635 สบ.", "plate_no_only": "718635", "driver_name": "B",
     "driver_id": 11, "device_types_id": 2},
]


def trip(dp, code, kind, minutes, ticket="2026-10-05 07:10:00"):
    arrive = pd.Timestamp("2026-10-05 08:00:00")
    leave = arrive + pd.Timedelta(minutes=minutes) if minutes is not None else pd.NaT
    return {"หมายเลข DP": dp, "รหัสรถ": code, "ประเภทรถ": kind, "ชื่อแพลนต์": "บางนา",
            "เวลาถึงไซต์งาน": arrive, "เวลาออกจากไซต์งาน": leave, "เวลาออกตั๋ว": ticket, "อื่นๆ": "x"}


def frame(*rows):
    return pd.DataFrame(list(rows))


@pytest.mark.parametrize("minutes,tier,comp_ml,comp_ms", [
    (90, "tier_0", 0, 0), (91, "tier_1", 1, 0.5), (119, "tier_1", 1, 0.5), (120, "tier_2", 2, 1),
    (150, "tier_2", 2, 1), (151, "tier_3", 3, 1.5), (None, "no_tier", 0, 0),
])
def test_tiers_and_compensation(minutes, tier, comp_ml, comp_ms):
    out = transform(frame(trip("D1", 6496, ML, minutes), trip("D2", 7001, f" {MS} ", minutes)), VEHICLES)
    assert list(out["tier"]) == [tier, tier]
    assert list(out["compensate"]) == [comp_ml, comp_ms]
    assert list(out["truck_type"]) == ["ML", "MS"]


def test_numeric_codes_read_as_floats_still_map():          # 2026-09-28 "6496.0" regression
    out = transform(frame(trip("D1", 6496.0, ML, 100)), VEHICLES)
    assert out.loc[0, "TruckNo"] == "6496" and out.loc[0, "TruckPlateNo"] == "71-6496 สบ."


def test_payload_converts_and_drops_unmapped_rows():
    out = transform(frame(trip("D1", 6496, ML, 100), trip("D2", "ZZ999", ML, 100), trip("D3", "7001", MS, None)),
                    VEHICLES)
    rows, dropped = payload(out)
    assert dropped == 1 and [r["TicketNo"] for r in rows] == ["D1", "D3"]
    first, third = rows
    assert first["SiteMoveInAt"] == "2026-10-05T08:00:00" and first["date_ticket"] == "2026-10-05"
    assert first["minutes_diff"] == 100 and first["compensate"] == 1 and first["is_complete_trip"] == "Y"
    assert third["SiteMoveOutAt"] is None and third["tier"] == "no_tier" and third["is_complete_trip"] == "N"
    assert "_id" not in first and first["driver_name"] == "A"


def test_zero_rows_after_mapping_is_an_error():
    with pytest.raises(RmcError, match="0 rows"):
        check_sending(date(2026, 10, 5), fetched=12, sending=0)
    check_sending(date(2026, 10, 5), fetched=0, sending=0)          # a day with no trips is fine


def test_pending_days_caps_at_14():
    assert pending_days(date(2026, 10, 4), date(2026, 10, 6)) == [date(2026, 10, 5)]
    assert pending_days(date(2026, 10, 5), date(2026, 10, 6)) == []
    gap = pending_days(date(2026, 9, 1), date(2026, 10, 6))
    assert len(gap) == 14 and gap[0] == date(2026, 9, 2)


def test_run_mode_validation():
    assert run_mode({})["kind"] == "catchup"
    m = run_mode({"DATE": "2026-10-05", "DRY_RUN": "true"})
    assert (m["kind"], m["start"], m["end"], m["dry_run"]) == ("manual", date(2026, 10, 5), date(2026, 10, 5), True)
    assert run_mode({"START": "2026-09-01", "END": "2026-09-14"})["end"] == date(2026, 9, 14)
    for bad in ({"DATE": "2026-10-05", "START": "2026-10-01"}, {"START": "2026-10-01"},
                {"START": "2026-10-05", "END": "2026-10-01"}, {"START": "2026-09-01", "END": "2026-09-15"},
                {"DATE": "05/10/2026"}):
        with pytest.raises(ValueError):
            run_mode(bad)


def test_run_days_advances_state_only_after_each_pushed_day():
    days = [date(2026, 10, 4), date(2026, 10, 5)]
    pushed, saved = [], []

    def fetch(d):
        if d == date(2026, 10, 5):
            return frame(trip("D9", "ZZ999", ML, 100))      # unmapped → 0 rows → guard
        return frame(trip("D1", 6496, ML, 100))

    with pytest.raises(RmcError):
        run_days(days, fetch, lambda rows: pushed.append(rows) or {"created": 1}, VEHICLES, on_success=saved.append)
    assert saved == [date(2026, 10, 4)] and len(pushed) == 1


def test_dry_run_never_pushes_or_saves():
    pushed, saved = [], []
    stats = run_days([date(2026, 10, 4)], lambda d: frame(trip("D1", 6496, ML, 100)),
                     lambda rows: pushed.append(rows), VEHICLES, dry_run=True, on_success=saved.append)
    assert pushed == [] and saved == [] and stats[0]["rows"] == 1 and stats[0]["pushed"] is False
```

- [ ] **Step 3: Run them to verify they fail**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/rmc -q -p no:cacheprovider`
Expected: collection error `ModuleNotFoundError: No module named 'rmc_logic'`

- [ ] **Step 4: Implement**

```python file=scripts/rmc/rmc_logic.py
"""CPAC RMC compensation — transform, payload and run rules (spec §10.2).

Ported from schedule_fuel/Cpac_compen/compensation_cpac/rmc_daily/rmc_daily.py with the same tiers
(site minutes 91–119 / 120–150 / > 150; ML 1/2/3, MS 0.5/1/1.5), the 2026-09-28 fix for numeric truck
codes read as "6496.0", and one new guard: a day that fetched trips but would send 0 rows fails instead
of silently advancing (the bug that lost 32 days).
"""
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

MAX_CATCHUP_DAYS = 14
ML, MS = "รถโม่ใหญ่ 10 ล้อ", "รถโม่เล็ก 4 ล้อ"
SOURCE_COLUMNS = ["หมายเลข DP", "รหัสรถ", "ประเภทรถ", "ชื่อแพลนต์", "เวลาถึงไซต์งาน", "เวลาออกจากไซต์งาน", "เวลาออกตั๋ว"]
REQUIRED = ["TicketNo", "TruckPlateNo", "TruckPlateNo_clean", "PlantName", "truck_type", "date_ticket"]
STRING_COLS = ["TicketNo", "TruckNo", "TruckPlateNo", "TruckPlateNo_clean", "PlantName", "tier", "truck_type",
               "is_complete_trip"]
DATETIME_COLS = ["SiteMoveInAt", "SiteMoveOutAt", "TicketCreateAt"]


class RmcError(RuntimeError):
    """A day that must not be counted as done."""


def transform(raw: pd.DataFrame, vehicles: list[dict]) -> pd.DataFrame:
    """fleetlink trip report rows + vehicle mapping → compensation rows (rmc_daily.transform_data)."""
    df = raw[SOURCE_COLUMNS].copy()
    df["เวลาถึงไซต์งาน"] = pd.to_datetime(df["เวลาถึงไซต์งาน"], errors="coerce")
    df["เวลาออกจากไซต์งาน"] = pd.to_datetime(df["เวลาออกจากไซต์งาน"], errors="coerce")
    df["site_minutes"] = ((df["เวลาออกจากไซต์งาน"] - df["เวลาถึงไซต์งาน"]).dt.total_seconds() / 60).round(0)
    minutes = df["site_minutes"]
    df["tier"] = np.select(
        [minutes.isna(), minutes < 91, minutes.between(91, 119), minutes.between(120, 150), minutes > 150],
        ["no_tier", "tier_0", "tier_1", "tier_2", "tier_3"], default="tier_3")
    df["ประเภทรถ"] = df["ประเภทรถ"].astype(str).str.strip()
    kind, tier = df["ประเภทรถ"], df["tier"]
    df["compensate"] = np.select(
        [(tier == "tier_1") & (kind == ML), (tier == "tier_2") & (kind == ML), (tier == "tier_3") & (kind == ML),
         (tier == "tier_1") & (kind == MS), (tier == "tier_2") & (kind == MS), (tier == "tier_3") & (kind == MS)],
        [1, 2, 3, 0.5, 1, 1.5], default=0)
    # numeric-only codes come back from Excel as floats → "6496.0"; strip ".0" so the mapping matches
    df["รหัสรถ"] = df["รหัสรถ"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
    vehicle_df = pd.DataFrame(vehicles)
    vehicle_df["code"] = pd.to_numeric(vehicle_df["code"], errors="coerce").fillna(0).astype(int).astype(str)
    df = df.merge(vehicle_df, how="left", left_on="รหัสรถ", right_on="code")
    df["truck_type"] = df["ประเภทรถ"].map({ML: "ML", MS: "MS"})
    df = df.rename(columns={
        "หมายเลข DP": "TicketNo", "รหัสรถ": "TruckNo", "plate_no": "TruckPlateNo",
        "plate_no_only": "TruckPlateNo_clean", "ชื่อแพลนต์": "PlantName", "เวลาถึงไซต์งาน": "SiteMoveInAt",
        "เวลาออกจากไซต์งาน": "SiteMoveOutAt", "site_minutes": "minutes_diff", "เวลาออกตั๋ว": "TicketCreateAt"})
    df["date_ticket"] = pd.to_datetime(df["TicketCreateAt"], errors="coerce").dt.date
    df["is_complete_trip"] = np.where(df["SiteMoveInAt"].notna() & df["SiteMoveOutAt"].notna(), "Y", "N")
    return df


def payload(df: pd.DataFrame) -> tuple[list[dict], int]:
    """Rows ready for API_PUSH (rmc_daily.push_api without the HTTP call) and how many were dropped."""
    df = df.replace([np.inf, -np.inf], np.nan)
    before = len(df)
    df = df.dropna(subset=REQUIRED).copy()
    dropped = before - len(df)
    for col in STRING_COLS:
        if col in df.columns:
            df[col] = df[col].astype(str)
    for col in DATETIME_COLS:
        df[col] = pd.to_datetime(df[col], errors="coerce").apply(lambda x: x.isoformat() if pd.notnull(x) else None)
    df["date_ticket"] = pd.to_datetime(df["date_ticket"]).dt.date.astype(str)
    df["minutes_diff"] = pd.to_numeric(df["minutes_diff"], errors="coerce").fillna(0)
    df["compensate"] = pd.to_numeric(df["compensate"], errors="coerce").fillna(0)
    df = df.astype(object).where(pd.notnull(df), None)
    return df.to_dict(orient="records"), dropped


def check_sending(day: date, fetched: int, sending: int) -> None:
    if fetched > 0 and sending == 0:
        raise RmcError(f"{day.isoformat()}: fetched {fetched} trips but 0 rows left to send "
                       "(vehicle mapping or required columns) — not marking the day done")


def pending_days(last_success: date, today: date, cap: int = MAX_CATCHUP_DAYS) -> list[date]:
    """Days after `last_success` through yesterday, at most `cap` of them (oldest first)."""
    days, d = [], last_success + timedelta(days=1)
    while d <= today - timedelta(days=1) and len(days) < cap:
        days.append(d)
        d += timedelta(days=1)
    return days


def _iso_day(text: str, name: str) -> date:
    try:
        return datetime.strptime(text.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"{name} must be YYYY-MM-DD, got {text!r}") from None


def run_mode(env: dict) -> dict:
    """DATE | START+END → manual run (state untouched); nothing → catch-up. DRY_RUN never pushes."""
    day, start, end = (env.get(k, "").strip() for k in ("DATE", "START", "END"))
    dry_run = env.get("DRY_RUN", "").strip().lower() in ("1", "true", "yes", "on")
    if day and (start or end):
        raise ValueError("use either DATE or START + END, not both")
    if bool(start) != bool(end):
        raise ValueError("START and END must be given together")
    if day:
        d = _iso_day(day, "DATE")
        return {"kind": "manual", "start": d, "end": d, "dry_run": dry_run}
    if start:
        s, e = _iso_day(start, "START"), _iso_day(end, "END")
        if s > e:
            raise ValueError("START must be on or before END")
        if (e - s).days + 1 > MAX_CATCHUP_DAYS:
            raise ValueError(f"at most {MAX_CATCHUP_DAYS} days per run")
        return {"kind": "manual", "start": s, "end": e, "dry_run": dry_run}
    return {"kind": "catchup", "start": None, "end": None, "dry_run": dry_run}


def run_days(days, fetch, push, vehicles, dry_run=False, on_success=None) -> list[dict]:
    """fetch → transform → payload → guard → push, one day at a time; `on_success(day)` after each pushed day."""
    stats = []
    for d in days:
        raw = fetch(d)
        records, dropped = payload(transform(raw, vehicles))
        check_sending(d, len(raw), len(records))
        result = push(records) if records and not dry_run else None
        if on_success and not dry_run:
            on_success(d)
        stats.append({"day": d.isoformat(), "fetched": int(len(raw)), "dropped": int(dropped),
                      "rows": len(records), "pushed": bool(records) and not dry_run, "result": result})
    return stats
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/rmc -q -p no:cacheprovider`
Expected: `14 passed`

- [ ] **Step 6: Commit**

```bash
git add scripts/rmc/rmc_logic.py scripts/rmc/tests/conftest.py scripts/rmc/tests/test_rmc_logic.py
git commit -m "feat(rmc): compensation tiers, payload, 0-rows guard and run modes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: RMC fleetlink client, pipeline (`rmc_compensation`) and seed script

- Fleetlink request body is the one `rmc_daily.py` sends; the 136 vehicle ids and company 1231 are imported from `scripts/cpac/pipeline_cpac.py` (`VEHICLE_LIST`, identical to the Mac job's list) — nothing new about CPAC goes into the repo. `POST_URL` is the same fleetlink endpoint the cpac pipeline already uses; `API_PUSH` is new on Render.
- HTTP failures are retried 3× (waits 5 s, 15 s) and reported without the URL's query string — the fleetlink file link may be signed and run errors are shown in FCC.
- State: `analytics.etl_state {_id: "rmc_compensation", last_success_date, updated_at}`; catch-up runs advance it after each pushed day; manual (`DATE`, `START`+`END`) and `DRY_RUN` runs never touch it. Before the user seeds it at cutover, the 09:00 run fails with a clear message and pushes nothing.
- Vehicle mapping: `analytics.rmc_vehicles` (591 rows from the Mac's `vehicle.json`, holds driver names → never in git), loaded by `seed_rmc.py`; `--state` (seeding `etl_state`) is a cutover step for the user.

**Files:**
- Create: `scripts/rmc/rmc_client.py`
- Create: `scripts/rmc/pipeline_rmc.py`
- Create: `scripts/rmc/seed_rmc.py`
- Test: `scripts/rmc/tests/test_rmc_client.py`, `scripts/rmc/tests/test_pipeline_rmc.py`, `scripts/rmc/tests/test_seed_rmc.py`

**Interfaces:**
- Consumes: Task 3 `RmcError`, `pending_days`, `run_days`, `run_mode`; `common.MONGODB_URI`, `JobLog`, `log`, `now_bkk()`; `pipeline_cpac.VEHICLE_LIST`.
- Produces: `fetch_report(day, post_url, vehicle_list, session=None, sleep=time.sleep) -> DataFrame`; `push_records(records, api_push, session=None, sleep=time.sleep)`; `RETRY_WAITS = (5, 15)`; `STATE_ID = "rmc_compensation"`, `load_vehicles(db)`, `load_last_success(db) -> date`, `save_last_success(db, day)`; `vehicle_docs(data) -> list[dict]`; env `DATE`, `START`, `END` (YYYY-MM-DD), `DRY_RUN`, `POST_URL`, `API_PUSH`; JobLog `job_type` = `pipeline` = `"rmc_compensation"`.

- [ ] **Step 1: Write the failing tests**

```python file=scripts/rmc/tests/test_rmc_client.py
import io
from datetime import date

import pandas as pd
import pytest
import requests

from rmc_client import RETRY_WAITS, fetch_report, push_records


class Resp:
    def __init__(self, payload=None, content=b"", status=200):
        self.payload, self.content, self.status_code = payload, content, status
        self.text = str(payload)

    def raise_for_status(self):
        if self.status_code >= 400:  # requests puts the full URL in the message
            raise requests.HTTPError(f"{self.status_code} for url: https://files/x.xlsx?sig=SECRET", response=self)

    def json(self):
        if self.payload is None:
            raise ValueError("no json")
        return self.payload


class Session:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def excel_bytes():
    buf = io.BytesIO()
    pd.DataFrame({"หมายเลข DP": ["D1"], "รหัสรถ": [6496]}).to_excel(buf, startrow=3, index=False)
    return buf.getvalue()


def test_fetch_report_requests_the_day_and_reads_the_excel():
    session = Session([Resp({"result": "https://files/x.xlsx"}), Resp(content=excel_bytes())])
    df = fetch_report(date(2026, 10, 5), "https://fleet/report", [11, 22], session=session, sleep=lambda s: None)
    assert list(df["หมายเลข DP"]) == ["D1"]
    method, url, kwargs = session.calls[0]
    assert (method, url) == ("POST", "https://fleet/report")
    body = kwargs["json"]
    assert body["date_start"] == "2026-10-05 00:00:00" and body["date_end"] == "2026-10-05 23:59:59"
    assert body["vehicle_list"] == [11, 22] and body["vehicle_visibility"] == "11,22" and body["company_id"] == 1231
    assert session.calls[1][:2] == ("GET", "https://files/x.xlsx")


def test_fetch_report_retries_then_fails():
    waits = []
    session = Session([requests.ConnectionError("down")] * 3)
    with pytest.raises(RuntimeError, match="POST https://fleet/report failed after 3 attempts: ConnectionError"):
        fetch_report(date(2026, 10, 5), "https://fleet/report", [1], session=session, sleep=waits.append)
    assert waits == list(RETRY_WAITS)


def test_failed_download_does_not_leak_the_signed_link():
    session = Session([Resp({"result": "https://files/x.xlsx?sig=SECRET"})] + [Resp(status=403)] * 3)
    with pytest.raises(RuntimeError) as err:
        fetch_report(date(2026, 10, 5), "https://fleet/report", [1], session=session, sleep=lambda s: None)
    assert "HTTP 403" in str(err.value) and "SECRET" not in str(err.value)


def test_fetch_report_without_file_url_fails():
    with pytest.raises(RuntimeError, match="no result file"):
        fetch_report(date(2026, 10, 5), "https://fleet/report", [1], session=Session([Resp({"result": None})]))


def test_push_returns_api_counts_and_needs_a_url():
    session = Session([Resp({"created": 2, "updated": 1, "total": 3})])
    assert push_records([{"a": 1}], "https://push", session=session) == {"created": 2, "updated": 1, "total": 3}
    assert session.calls[0][2]["json"] == [{"a": 1}]
    with pytest.raises(RuntimeError):
        push_records([{"a": 1}], "")
```

```python file=scripts/rmc/tests/test_pipeline_rmc.py
from datetime import date, datetime

import pytest

import pipeline_rmc
from pipeline_rmc import STATE_ID, VEHICLE_LIST, load_last_success, load_vehicles, save_last_success
from rmc_logic import ML, RmcError
from test_rmc_logic import VEHICLES, frame, trip


class Col:
    def __init__(self):
        self.docs, self.updates = [], []

    def find(self, query, projection):
        return [{k: v for k, v in d.items() if k != "_id"} for d in self.docs]

    def find_one(self, query):
        return next((d for d in self.docs if d.get("_id") == query["_id"]), None)

    def update_one(self, query, update, upsert=False):
        self.updates.append((query, update, upsert))


class DB(dict):
    def __getitem__(self, name):
        return self.setdefault(name, Col())


def test_vehicle_mapping_must_be_seeded():
    db = DB()
    with pytest.raises(RmcError, match="seed_rmc"):
        load_vehicles(db)
    db["rmc_vehicles"].docs = [{"_id": "x", "code": "6496"}]
    assert load_vehicles(db) == [{"code": "6496"}]


def test_state_is_read_and_written_as_one_doc():
    db = DB()
    with pytest.raises(RmcError, match="state.json"):
        load_last_success(db)
    db["etl_state"].docs = [{"_id": STATE_ID, "last_success_date": "2026-10-05"}]
    assert load_last_success(db) == date(2026, 10, 5)
    save_last_success(db, date(2026, 10, 6))
    query, update, upsert = db["etl_state"].updates[0]
    assert query == {"_id": STATE_ID} and upsert is True
    assert update["$set"]["last_success_date"] == "2026-10-06"


def test_vehicle_list_is_the_cpac_pipeline_list():
    assert len(VEHICLE_LIST) == 136 and len(set(VEHICLE_LIST)) == 136


class FakeJob:
    def __init__(self, job_type, pipeline, meta=None):
        self.meta, self.finished = meta, []

    def finish(self, status="success", **extra):
        self.finished.append((status, extra))


def test_bad_parameters_are_logged_as_a_failed_run(monkeypatch):
    jobs = []
    monkeypatch.setattr(pipeline_rmc, "JobLog", lambda *a: jobs.append(FakeJob(*a)) or jobs[-1])
    monkeypatch.setenv("DATE", "2026-10-05")
    monkeypatch.setenv("START", "2026-10-01")
    for name in ("END", "DRY_RUN"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(ValueError, match="not both"):
        pipeline_rmc.main()
    assert jobs[0].meta == {"date": "2026-10-05", "start": "2026-10-01"}
    assert jobs[0].finished[0][0] == "failed"


def run_main(monkeypatch, env, db, now=datetime(2026, 10, 6, 9, 0)):
    """main() with Mongo, fleetlink and the push API faked; returns the pushed batches."""
    pushed = []
    monkeypatch.setattr(pipeline_rmc, "JobLog", lambda *a: FakeJob(*a))
    monkeypatch.setattr(pipeline_rmc, "MongoClient", lambda uri: {"analytics": db})
    monkeypatch.setattr(pipeline_rmc, "now_bkk", lambda: now)
    monkeypatch.setattr(pipeline_rmc, "fetch_report", lambda d, url, ids: frame(trip("D1", 6496, ML, 100)))
    monkeypatch.setattr(pipeline_rmc, "push_records", lambda rows, url: pushed.append(rows) or {"created": len(rows)})
    for name in ("DATE", "START", "END", "DRY_RUN"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    pipeline_rmc.main()
    return pushed


def seeded_db(last_success=None):
    db = DB()
    db["rmc_vehicles"].docs = [dict(v) for v in VEHICLES]
    if last_success:
        db["etl_state"].docs = [{"_id": STATE_ID, "last_success_date": last_success}]
    return db


def test_manual_runs_push_but_never_touch_the_state(monkeypatch):
    db = seeded_db()
    assert len(run_main(monkeypatch, {"DATE": "2026-10-05"}, db)) == 1
    assert len(run_main(monkeypatch, {"START": "2026-10-01", "END": "2026-10-02"}, db)) == 2
    assert db["etl_state"].updates == []


def test_catch_up_pushes_each_missed_day_and_advances_the_state(monkeypatch):
    db = seeded_db("2026-10-03")
    assert len(run_main(monkeypatch, {}, db)) == 2  # 10-04 and 10-05; today (10-06) is not done yet
    assert [u[1]["$set"]["last_success_date"] for u in db["etl_state"].updates] == ["2026-10-04", "2026-10-05"]


def test_dry_catch_up_neither_pushes_nor_saves(monkeypatch):
    db = seeded_db("2026-10-03")
    assert run_main(monkeypatch, {"DRY_RUN": "true"}, db) == []
    assert db["etl_state"].updates == []
```

```python file=scripts/rmc/tests/test_seed_rmc.py
import pytest

from seed_rmc import FIELDS, vehicle_docs


def test_vehicle_docs_keep_exactly_the_mapping_fields():
    docs = vehicle_docs({"data": [{"id": 1, "code": "6496", "plate_no": "71-6496 สบ.", "plate_no_only": "716496",
                                   "driver_name": "A", "driver_id": 10, "device_types_id": 2, "extra": "x"}]})
    assert list(docs[0]) == list(FIELDS) and "extra" not in docs[0]


def test_vehicle_docs_reject_empty_files():
    with pytest.raises(ValueError):
        vehicle_docs({"data": []})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/rmc -q -p no:cacheprovider`
Expected: collection errors `No module named 'rmc_client'`, `'pipeline_rmc'`, `'seed_rmc'`

- [ ] **Step 3: Implement the client**

```python file=scripts/rmc/rmc_client.py
"""CPAC fleetlink report fetch + compensation push (spec §10.2), ported from rmc_daily.py."""
import io
import logging
import time
from datetime import date
from urllib.parse import urlsplit

import pandas as pd
import requests

log = logging.getLogger("rmc")
RETRY_WAITS = (5, 15)          # 3 attempts, as rmc_daily
COMPANY_ID = 1231


def _where(url: str) -> str:
    """URL without its query — the fleetlink file link may be signed, and run errors are shown in FCC."""
    return urlsplit(url)._replace(query="", fragment="").geturl()


def _reason(e: requests.RequestException) -> str:
    status = getattr(e.response, "status_code", None) if e.response is not None else None
    return f"HTTP {status}" if status else type(e).__name__


def request_with_retry(session, method: str, url: str, sleep=time.sleep, **kwargs):
    reason = ""
    for attempt in range(len(RETRY_WAITS) + 1):
        try:
            resp = session.request(method, url, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            reason = _reason(e)
            log.warning("%s %s attempt %d failed: %s", method, _where(url), attempt + 1, reason)
            if attempt < len(RETRY_WAITS):
                sleep(RETRY_WAITS[attempt])
    raise RuntimeError(f"{method} {_where(url)} failed after {len(RETRY_WAITS) + 1} attempts: {reason}")


def fetch_report(day: date, post_url: str, vehicle_list: list[int], session=None, sleep=time.sleep) -> pd.DataFrame:
    """POST the report request, download the Excel it points to, read it like rmc_daily (skiprows=3)."""
    if not post_url:
        raise RuntimeError("POST_URL is not set")
    session = session or requests.Session()
    body = {
        "date_start": f"{day.isoformat()} 00:00:00", "date_end": f"{day.isoformat()} 23:59:59",
        "type": "vehicle", "vehicle_list": vehicle_list, "plants_list": ["all"], "company_id": COMPANY_ID,
        "vehicle_visibility": ",".join(map(str, vehicle_list)), "site_id": "", "type_file": "excel",
    }
    resp = request_with_retry(session, "POST", post_url, sleep=sleep, json=body, timeout=180)
    file_url = (resp.json() or {}).get("result")
    if not file_url:
        raise RuntimeError("fleetlink returned no result file URL")
    excel = request_with_retry(session, "GET", file_url, sleep=sleep, timeout=180)
    return pd.read_excel(io.BytesIO(excel.content), skiprows=3)


def push_records(records: list[dict], api_push: str, session=None, sleep=time.sleep):
    """POST the rows to API_PUSH (upsert); returns its JSON ({created, updated, total}) or text."""
    if not api_push:
        raise RuntimeError("API_PUSH is not set")
    session = session or requests.Session()
    resp = request_with_retry(session, "POST", api_push, sleep=sleep, json=records, timeout=120)
    try:
        return resp.json()
    except ValueError:
        return resp.text[:500]
```

- [ ] **Step 4: Implement the pipeline**

```python file=scripts/rmc/pipeline_rmc.py
"""rmc_compensation — CPAC fleetlink trips → site-time tiers → push to API_PUSH (spec §10.2).

Port of schedule_fuel/.../rmc_daily/rmc_daily.py. Env: DATE (YYYY-MM-DD) or START + END (inclusive,
≤ 14 days), DRY_RUN (fetch + transform only). With no dates it catches up every day after
analytics.etl_state {_id: "rmc_compensation"}.last_success_date through yesterday (≤ 14 per run),
advancing the state after each pushed day. Manual and dry runs never touch the state.
Needs POST_URL (same fleetlink endpoint as the cpac pipeline) and API_PUSH; the vehicle mapping is
read from analytics.rmc_vehicles (seed it with seed_rmc.py — it is not kept in this public repo).
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS / "engineon"))
sys.path.insert(0, str(SCRIPTS / "cpac"))
from common import MONGODB_URI, JobLog, log, now_bkk  # noqa: E402
from pipeline_cpac import VEHICLE_LIST  # noqa: E402  — same 136 fleetlink vehicles, company 1231
from pymongo import MongoClient  # noqa: E402

from rmc_client import fetch_report, push_records  # noqa: E402
from rmc_logic import RmcError, pending_days, run_days, run_mode  # noqa: E402

STATE_ID = "rmc_compensation"


def load_vehicles(db) -> list[dict]:
    vehicles = list(db["rmc_vehicles"].find({}, {"_id": 0}))
    if not vehicles:
        raise RmcError("analytics.rmc_vehicles is empty — run scripts/rmc/seed_rmc.py first")
    return vehicles


def load_last_success(db):
    doc = db["etl_state"].find_one({"_id": STATE_ID})
    if not doc or not doc.get("last_success_date"):
        raise RmcError("analytics.etl_state has no rmc_compensation.last_success_date — seed it from state.json")
    return datetime.strptime(doc["last_success_date"], "%Y-%m-%d").date()


def save_last_success(db, day) -> None:
    db["etl_state"].update_one(
        {"_id": STATE_ID},
        {"$set": {"last_success_date": day.isoformat(), "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)}},
        upsert=True)
    log.info("rmc state → last_success_date %s", day)


def main() -> None:
    env = dict(os.environ)
    # log first, so a bad parameter shows up as a failed run on the Jobs tab card
    job = JobLog("rmc_compensation", "rmc_compensation",
                 {k.lower(): env[k] for k in ("DATE", "START", "END", "DRY_RUN") if env.get(k)})
    try:
        mode = run_mode(env)
        db = MongoClient(MONGODB_URI)["analytics"]
        vehicles = load_vehicles(db)
        post_url, api_push = os.getenv("POST_URL"), os.getenv("API_PUSH")
        on_success = None
        if mode["kind"] == "manual":
            days = [mode["start"] + timedelta(days=i) for i in range((mode["end"] - mode["start"]).days + 1)]
        else:
            days = pending_days(load_last_success(db), now_bkk().date())
            if not mode["dry_run"]:
                on_success = lambda d: save_last_success(db, d)  # noqa: E731
        stats = run_days(days,
                         fetch=lambda d: fetch_report(d, post_url, VEHICLE_LIST),
                         push=lambda rows: push_records(rows, api_push),
                         vehicles=vehicles, dry_run=mode["dry_run"], on_success=on_success)
        job.finish("success", mode=mode["kind"], dry_run=mode["dry_run"], records=sum(s["rows"] for s in stats),
                   days=stats)
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Implement the seed script**

```python file=scripts/rmc/seed_rmc.py
"""One-off: load the CPAC vehicle mapping (vehicle.json) into analytics.rmc_vehicles.

    .venv/bin/python scripts/rmc/seed_rmc.py PATH/TO/vehicle.json [--state PATH/TO/state.json]

--state also seeds analytics.etl_state {_id: "rmc_compensation"} — a cutover step (spec §10.6), only
with the user's go-ahead. The mapping holds driver names, which is why it lives in Mongo and not in
this public repo.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, log  # noqa: E402
from pymongo import ASCENDING, MongoClient  # noqa: E402

FIELDS = ("id", "code", "plate_no", "plate_no_only", "driver_name", "driver_id", "device_types_id")


def vehicle_docs(data: dict) -> list[dict]:
    rows = data.get("data") if isinstance(data, dict) else None
    if not rows:
        raise ValueError("vehicle.json has no 'data' rows")
    return [{k: row.get(k) for k in FIELDS} for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("vehicle_json")
    parser.add_argument("--state")
    args = parser.parse_args()
    docs = vehicle_docs(json.loads(Path(args.vehicle_json).read_text(encoding="utf-8")))
    db = MongoClient(MONGODB_URI)["analytics"]
    db["rmc_vehicles"].delete_many({})
    db["rmc_vehicles"].insert_many(docs)
    db["rmc_vehicles"].create_index([("code", ASCENDING)], name="code")
    log.info("rmc_vehicles: %d rows", len(docs))
    if args.state:
        last = json.loads(Path(args.state).read_text(encoding="utf-8"))["last_success_date"]
        datetime.strptime(last, "%Y-%m-%d")
        db["etl_state"].update_one({"_id": "rmc_compensation"},
                                   {"$set": {"last_success_date": last,
                                             "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)}},
                                   upsert=True)
        log.info("etl_state rmc_compensation → %s", last)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/rmc -q -p no:cacheprovider`
Expected: `28 passed`

- [ ] **Step 7: Commit**

```bash
git add scripts/rmc/rmc_client.py scripts/rmc/pipeline_rmc.py scripts/rmc/seed_rmc.py scripts/rmc/tests/test_rmc_client.py scripts/rmc/tests/test_pipeline_rmc.py scripts/rmc/tests/test_seed_rmc.py
git commit -m "feat(rmc): rmc_compensation pipeline — fleetlink fetch, push, Mongo state and mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Engine-on `ENGINE_LOGIC` parameter

`ENGINE_LOGIC=v2` (manual runs only; the nightly keeps `current`): boxes whose `version_type` is `v1` (firmware without voltage) count every parked (`จอดรถ`) reading as engine-on; v2 boxes keep the ≥ 25 V rule; raw and summary records of a v2 run carry `engine_logic: "v2"` and `confirmed_by_voltage` (true for v2 boxes). `current` output is byte-for-byte today's (no new fields). Writes are `ReplaceOne`, so a later `current` run of the same day replaces the summary records again; v2-only raw events stay tagged `engine_logic: "v2"`. `ENGINEON_RAW_COLLECTION` / `ENGINEON_SUMMARY_COLLECTION` redirect the writes for smoke tests (`raw_engineon_*` / `summary_engineon_*` only). The parameters are validated inside the logged `try`.

**Files:**
- Modify: `scripts/engineon/pipeline_engineon.py`
- Create: `scripts/engineon/tests/conftest.py`
- Test: `scripts/engineon/tests/test_engine_logic.py`

**Interfaces:**
- Produces: `ENGINE_LOGICS = ("current", "v2")`; `_classify_engine_state(v, status, version_type=None, logic="current")`; `logic_fields(logic, version_type) -> dict`; `target_collection(env, name, default) -> str`; `process_engineon_data_optimized(..., engine_logic="current", raw_collection="raw_engineon", summary_collection="summary_engineon")`; env `ENGINE_LOGIC`.

- [ ] **Step 1: Write the failing tests**

```python file=scripts/engineon/tests/conftest.py
import sys
from pathlib import Path

# Pipeline scripts import their siblings by module name (they run as files), so tests do the same.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

```python file=scripts/engineon/tests/test_engine_logic.py
import pytest

from pipeline_engineon import _classify_engine_state, logic_fields, process_engineon_data_optimized, target_collection

NAN = float("nan")


def test_current_logic_is_unchanged():
    assert _classify_engine_state(26.0, "จอดรถ") == "Parking - Engine On"
    assert _classify_engine_state(24.0, "จอดรถ", "v1", "current") == "Parking - Engine Off"
    assert _classify_engine_state(NAN, "จอดรถ", "v1") == "Unknown"
    assert _classify_engine_state(30.0, "รถวิ่ง", "v2", "v2") == "Other"


def test_v2_logic_counts_every_parked_v1_reading():
    assert _classify_engine_state(NAN, "จอดรถ", "v1", "v2") == "Parking - Engine On"
    assert _classify_engine_state(10.0, "จอดรถ", "v1", "v2") == "Parking - Engine On"
    assert _classify_engine_state(10.0, "จอดรถ", "v2", "v2") == "Parking - Engine Off"
    assert _classify_engine_state(26.0, "จอดรถ", "v2", "v2") == "Parking - Engine On"


def test_logic_fields_only_on_v2_runs():
    assert logic_fields("current", "v1") == {}
    assert logic_fields("v2", "v2") == {"engine_logic": "v2", "confirmed_by_voltage": True}
    assert logic_fields("v2", "v1") == {"engine_logic": "v2", "confirmed_by_voltage": False}


def test_target_collection_only_allows_scratch_variants():
    assert target_collection({}, "X", "raw_engineon") == "raw_engineon"
    assert target_collection({"X": "raw_engineon_smoke"}, "X", "raw_engineon") == "raw_engineon_smoke"
    with pytest.raises(ValueError):
        target_collection({"X": "overspeed"}, "X", "raw_engineon")


def test_unknown_logic_fails_before_touching_mongo():
    with pytest.raises(ValueError, match="ENGINE_LOGIC"):
        process_engineon_data_optimized("mongodb://unused", engine_logic="v3")
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/engineon/tests -q -p no:cacheprovider`
Expected: collection error `ImportError: cannot import name 'logic_fields' from 'pipeline_engineon'`

- [ ] **Step 3: Implement** (apply with `git apply` from the worktree root, or make the same edits by hand)

```diff
--- a/scripts/engineon/pipeline_engineon.py
+++ b/scripts/engineon/pipeline_engineon.py
@@ -4,11 +4,16 @@
 
 Default range: yesterday (Bangkok). Override via env START_DATE / END_DATE (dd/mm/YYYY),
 MAX_DISTANCE (meters, default 200) — passed through POST /pipeline/run/engineon body.
+ENGINE_LOGIC=v2 (manual runs only; the nightly stays "current"): boxes whose firmware reports no
+voltage ("v1") count every parked reading as engine-on, and every record gets engine_logic +
+confirmed_by_voltage. ENGINEON_RAW_COLLECTION / ENGINEON_SUMMARY_COLLECTION redirect the writes
+(smoke tests only).
 
 Ported from api-engineon app/etl_engineon.py (low-mem streaming version).
 """
 import gc
 import os
+import re
 import warnings
 from datetime import datetime, timedelta
 
@@ -43,14 +48,33 @@
         return None
 
 
-def _classify_engine_state(v, status):
+ENGINE_LOGICS = ("current", "v2")
+
+
+def _classify_engine_state(v, status, version_type=None, logic="current"):
     if status != "จอดรถ":
         return "Other"
+    if logic == "v2" and version_type == "v1":
+        return "Parking - Engine On"   # v1 firmware reports no voltage — every parked reading counts
     if pd.isna(v):
         return "Unknown"
     return "Parking - Engine On" if v >= 25.0 else "Parking - Engine Off"
 
 
+def logic_fields(logic: str, version_type: str | None) -> dict:
+    """Extra fields on raw/summary records: none for the nightly logic, provenance for v2 runs."""
+    if logic != "v2":
+        return {}
+    return {"engine_logic": "v2", "confirmed_by_voltage": version_type == "v2"}
+
+
+def target_collection(env, name: str, default: str) -> str:
+    value = env.get(name) or default
+    if not re.match(rf"^{default}(_[a-z0-9_]+)?$", value):
+        raise ValueError(f"{name} must be {default!r} or start with '{default}_', got {value!r}")
+    return value
+
+
 def _split_latlng(series: pd.Series):
     arr = series.astype(str).str.split(",", n=1, expand=True).to_numpy()
     lat = pd.to_numeric(arr[:, 0], errors="coerce")
@@ -76,13 +100,18 @@
     debug_vehicle: str | None = None,
     mongo_batch_size: int = 1000,
     write_batch_size: int = 1000,
+    engine_logic: str = "current",
+    raw_collection: str = "raw_engineon",
+    summary_collection: str = "summary_engineon",
 ):
+    if engine_logic not in ENGINE_LOGICS:
+        raise ValueError(f"ENGINE_LOGIC must be one of {ENGINE_LOGICS}, got {engine_logic!r}")
     client = MongoClient(mongo_uri)
 
     col_log = client[db_terminus]["driving_log"]
     col_plants = client[db_atms]["plants"]
-    col_raw = client[db_analytics]["raw_engineon"]
-    col_sum = client[db_analytics]["summary_engineon"]
+    col_raw = client[db_analytics][raw_collection]
+    col_sum = client[db_analytics][summary_collection]
 
     # -------- Plants --------
     plants = pd.DataFrame(list(col_plants.find({}, {"_id": 0})))
@@ -175,7 +204,7 @@
         # engine state
         vnum = pd.to_numeric(dfp["Voltage"], errors="coerce")
         dfp["engine_state"] = [
-            _classify_engine_state(v, s)
+            _classify_engine_state(v, s, version_type, engine_logic)
             for v, s in zip(vnum, dfp["สถานะ"].astype(str))
         ]
 
@@ -247,6 +276,7 @@
                             "ทะเบียนพาหนะ": plate,
                             "date": target_date,
                             "version_type": version_type,
+                            **logic_fields(engine_logic, version_type),
                             **rec,
                         },
                         upsert=True,
@@ -276,6 +306,7 @@
                             "total_engine_on_min_not_plant": not_plant_min,
                             "total_engine_on_hr_not_plant": not_plant_min / 60.0,
                             "version_type": version_type,
+                            **logic_fields(engine_logic, version_type),
                         },
                         upsert=True,
                     )
@@ -337,15 +368,19 @@
     start_date = os.getenv("START_DATE", y)
     end_date = os.getenv("END_DATE", y)
     max_distance = int(os.getenv("MAX_DISTANCE", "200"))
+    engine_logic = (os.getenv("ENGINE_LOGIC") or "current").strip().lower()
 
     job = JobLog("engineon", "engineon",
-                 {"start_date": start_date, "end_date": end_date})
+                 {"start_date": start_date, "end_date": end_date, "engine_logic": engine_logic})
     try:
         process_engineon_data_optimized(
             mongo_uri=MONGODB_URI,
             start_date=start_date,
             end_date=end_date,
             max_distance=max_distance,
+            engine_logic=engine_logic,
+            raw_collection=target_collection(os.environ, "ENGINEON_RAW_COLLECTION", "raw_engineon"),
+            summary_collection=target_collection(os.environ, "ENGINEON_SUMMARY_COLLECTION", "summary_engineon"),
         )
         job.finish("success")
     except Exception as e:
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest scripts/engineon/tests -q -p no:cacheprovider`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/engineon/pipeline_engineon.py scripts/engineon/tests/conftest.py scripts/engineon/tests/test_engine_logic.py
git commit -m "feat(engineon): ENGINE_LOGIC=v2 parameter with confirmed_by_voltage provenance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Register and schedule `overspeed` and `rmc_compensation`

**Files:**
- Modify: `routes/pipeline/pipeline_routes.py` (end of the three dicts)
- Modify: `main.py` (after the `sched_atms_stockmovement_light` line)
- Test: `tests/test_pipeline_registry.py`

**Interfaces:**
- Consumes: Task 2 `scripts/overspeed/pipeline_overspeed.py`, Task 4 `scripts/rmc/pipeline_rmc.py`.
- Produces: `POST /pipeline/run/overspeed`, `POST /pipeline/run/rmc_compensation`, `GET /pipeline/status/{type}` for both (last run from `analytics.etl_jobs` by `pipeline`); cron ids `sched_overspeed`, `sched_rmc_compensation`.

- [ ] **Step 1: Write the failing test**

```python file=tests/test_pipeline_registry.py
from pathlib import Path

from routes.pipeline.pipeline_routes import PIPELINE_NAMES, PIPELINE_SCRIPTS, RUN_LOG_LOCATION, SCRIPTS_DIR

ROOT = Path(__file__).resolve().parent.parent


def test_every_pipeline_has_a_script_a_name_and_a_log_location():
    for name, script in PIPELINE_SCRIPTS.items():
        assert script.is_file(), name
        assert name in PIPELINE_NAMES and name in RUN_LOG_LOCATION, name


def test_jobs_tab_pipelines_log_to_etl_jobs():
    assert PIPELINE_SCRIPTS["overspeed"].relative_to(SCRIPTS_DIR).as_posix() == "overspeed/pipeline_overspeed.py"
    assert PIPELINE_SCRIPTS["rmc_compensation"].relative_to(SCRIPTS_DIR).as_posix() == "rmc/pipeline_rmc.py"
    for name in ("overspeed", "rmc_compensation"):
        assert PIPELINE_NAMES[name] == name  # the JobLog `pipeline` that GET /pipeline/status/{type} looks up
        assert RUN_LOG_LOCATION[name] == ("analytics", "etl_jobs")


def test_jobs_tab_pipelines_run_at_their_bangkok_times():
    source = (ROOT / "main.py").read_text(encoding="utf-8")  # CronTrigger hours are UTC (BKK − 7)
    assert 'CronTrigger(hour=21, minute=30), args=["overspeed"]' in source       # 04:30 BKK
    assert 'CronTrigger(hour=2, minute=0), args=["rmc_compensation"]' in source  # 09:00 BKK
```

- [ ] **Step 2: Run it to verify it fails**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_pipeline_registry.py -q -p no:cacheprovider`
Expected: `KeyError: 'overspeed'` and the schedule assertion fails (2 failed, 1 passed)

- [ ] **Step 3: Implement** (two patches, `git apply` from the worktree root)

```diff
--- a/routes/pipeline/pipeline_routes.py
+++ b/routes/pipeline/pipeline_routes.py
@@ -33,6 +33,8 @@
     "maintenance": SCRIPTS_DIR / "maintenance" / "pipeline_maintenance.py",
     "atms_stockmovement": SCRIPTS_DIR / "atms_stockmovement" / "pipeline_atms_stockmovement.py",
     "atms_stockmovement_light": SCRIPTS_DIR / "atms_stockmovement" / "pipeline_atms_stockmovement_light.py",
+    "overspeed": SCRIPTS_DIR / "overspeed" / "pipeline_overspeed.py",
+    "rmc_compensation": SCRIPTS_DIR / "rmc" / "pipeline_rmc.py",
 }
 
 PIPELINE_NAMES = {"ld": "asia", "scco": "scco", "cpac": "cpac",
@@ -52,7 +54,9 @@
                   "fuel_tanks": "fuel_tanks",
                   "maintenance": "maintenance",
                   "atms_stockmovement": "atms_stockmovement",
-                  "atms_stockmovement_light": "atms_stockmovement_light"}
+                  "atms_stockmovement_light": "atms_stockmovement_light",
+                  "overspeed": "overspeed",
+                  "rmc_compensation": "rmc_compensation"}
 
 # Where each pipeline logs its runs: (db, collection)
 RUN_LOG_LOCATION = {
@@ -77,6 +81,8 @@
     "maintenance": ("analytics", "etl_jobs"),
     "atms_stockmovement": ("atms", "stockmovement_runs"),
     "atms_stockmovement_light": ("atms", "stockmovement_runs"),
+    "overspeed": ("analytics", "etl_jobs"),
+    "rmc_compensation": ("analytics", "etl_jobs"),
 }
 
 # In-memory run state (single-process; reset on restart)
```

```diff
--- a/main.py
+++ b/main.py
@@ -262,6 +262,12 @@
     #   (รอบ light ใช้เวลาจริง ~20 วินาที)
     scheduler.add_job(_run, CronTrigger(hour=22, minute=0), args=["atms_stockmovement"], id="sched_atms_stockmovement")
     scheduler.add_job(_run, CronTrigger(hour="1,5,9,13", minute=30), args=["atms_stockmovement_light"], id="sched_atms_stockmovement_light")
+    # Jobs tab (fuel-control-center spec §10) — BKK→UTC −7:
+    # overspeed 04:30 BKK → 21:30 UTC: reads the day engine-on (21:00) has just read, done before
+    #   atms_stockmovement's heavy writes at 22:00; rmc_compensation 09:00 BKK → 02:00 UTC: talks only
+    #   to CPAC fleetlink + the push API (moved off the Mac launchd job com.cpac.rmc-daily)
+    scheduler.add_job(_run, CronTrigger(hour=21, minute=30), args=["overspeed"], id="sched_overspeed")                # 04:30 BKK
+    scheduler.add_job(_run, CronTrigger(hour=2, minute=0), args=["rmc_compensation"], id="sched_rmc_compensation")   # 09:00 BKK
     # finance advance: overdue clearing reminder, daily 09:00 BKK (no-op unless FINANCE_EMAIL_ENABLED=true)
     from database import SessionLocal
     from services.finance.overdue_reminder import run_overdue_reminders
```

- [ ] **Step 4: Run the test, then the whole suite**

Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_pipeline_registry.py -q -p no:cacheprovider` → `3 passed`
Run: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q -p no:cacheprovider` → all pass (699 at the time of writing)
Run: `.venv/bin/python -m py_compile main.py routes/pipeline/pipeline_routes.py && git status --short` → only this task's files; restore any `.pyc` listed.

- [ ] **Step 5: Commit**

```bash
git add routes/pipeline/pipeline_routes.py main.py tests/test_pipeline_registry.py
git commit -m "feat(pipeline): register + schedule overspeed (04:30 BKK) and rmc_compensation (09:00 BKK)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part B — fuel-control-center (`~/Documents/project/fuel-control-center/fcc-jobs`)

### Task 7: Job catalog, validation and payload builder

One pure module drives both the proxy (type map, allow-lists) and the tab (cards, forms, validation, follow-up runs). Erasable TypeScript only (no enums, namespaces or parameter properties) so `node --test` runs it directly. The engine-on "rebuild trip summary" option (on by default) turns into follow-up `engineon-trip-summary` runs, one per month the range touches (yesterday's Bangkok month when no dates are given). The `test` script line is identical to the one on `feat/fuel-redesign`, so the two branches merge cleanly.

**Files:**
- Modify: `package.json` (`test` script)
- Create: `src/lib/pipeline-jobs.ts`
- Test: `src/lib/pipeline-jobs.test.mjs`

**Interfaces:**
- Produces: types `FieldKind`, `FormValue`, `FormState`, `JobField` (`key, label, kind, param?, placeholder?, half?, options?, defaultValue?`), `JobDef` (`type, ncacType, name, description, schedule, dateFormat, maxDays?, fields`), `FollowUp`, `RunPlan`; `JOBS: JobDef[]`; `TYPE_MAP: Record<string, string>` (UI type → api-ncac type, ETL-tab types included); `allowedParams(type) -> string[]`; `pickAllowed(type, body) -> Record<string, unknown>`; `initialForm(job) -> FormState`; `buildRun(job, form, now?) -> RunPlan`; `monthsBetween(startIso, endIso)`; `yesterdayBkk(now) -> "YYYY-MM-DD"`; `etlJobsQuery(params: URLSearchParams) -> { filter, limit }`; `formatDuration(sec) -> string`.

- [ ] **Step 1: Add the test script** (apply with `git apply`)

```diff
--- a/package.json
+++ b/package.json
@@ -7,7 +7,8 @@
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
-    "lint": "eslint ."
+    "lint": "eslint .",
+    "test": "node --test \"src/**/*.test.mjs\""
   },
   "dependencies": {
     "@radix-ui/react-dialog": "^1.1.15",
```

- [ ] **Step 2: Write the failing tests**

```javascript file=src/lib/pipeline-jobs.test.mjs
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
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `src/lib/pipeline-jobs.ts`

- [ ] **Step 4: Implement**

```typescript file=src/lib/pipeline-jobs.ts
// Jobs tab catalog and parameter rules (fuel spec §10). Pure — shared by the /pipeline page and the
// /api/pipeline/[type] proxy. Erasable TypeScript only, so `node --test` runs it without a build step.

export type FieldKind = "date" | "number" | "text" | "checkbox" | "select"
export type FormValue = string | boolean | undefined
export type FormState = Record<string, FormValue>

export type JobField = {
  key: string
  label: string
  kind: FieldKind
  /** payload key sent to the proxy (api-ncac upper-cases it into an env var); absent = UI-only */
  param?: string
  placeholder?: string
  /** half-width in the form grid (date pairs) */
  half?: boolean
  options?: { value: string; label: string }[]
  defaultValue?: string | boolean
}

export type JobDef = {
  type: string
  ncacType: string
  name: string
  description: string
  schedule: string
  dateFormat: "dmy" | "iso"
  maxDays?: number
  fields: JobField[]
}

export type FollowUp = { type: string; name: string; payload: Record<string, string | number> }
export type RunPlan =
  | { ok: true; payload: Record<string, string | number>; followUps: FollowUp[] }
  | { ok: false; errors: string[] }

const startEnd = (param = true): JobField[] => [
  { key: "start_date", label: "วันเริ่ม (ว่าง = เมื่อวาน)", kind: "date", param: param ? "start_date" : undefined, half: true },
  { key: "end_date", label: "วันสิ้นสุด", kind: "date", param: param ? "end_date" : undefined, half: true },
]

export const JOBS: JobDef[] = [
  {
    type: "overspeed", ncacType: "overspeed", name: "Overspeed",
    description: "ช่วงความเร็ว 60–70 และเกิน 70 กม./ชม. จาก GPS Terminus → หน้า /overspeed",
    schedule: "อัตโนมัติทุกวัน 04:30", dateFormat: "dmy", maxDays: 7,
    fields: [
      ...startEnd(),
      { key: "plates", label: "ทะเบียน (ว่าง = ทุกคัน)", kind: "text", param: "plates", placeholder: "71-8623, 72-5504" },
      { key: "min_duration_min", label: "นานกว่า (นาที)", kind: "number", param: "min_duration_min", defaultValue: "2" },
      { key: "min_records", label: "จำนวนจุดอย่างน้อย", kind: "number", param: "min_records", defaultValue: "5" },
      { key: "gap_minutes", label: "ช่องว่างตัดช่วง (นาที)", kind: "number", param: "gap_minutes", defaultValue: "2" },
    ],
  },
  {
    type: "rmc-compensation", ncacType: "rmc_compensation", name: "CPAC RMC compensation",
    description: "เที่ยวรถโม่ CPAC fleetlink → เวลาที่ไซต์ → ส่งค่าชดเชย (ว่างทุกช่อง = ตามเก็บวันที่ค้างถึงเมื่อวาน)",
    schedule: "อัตโนมัติทุกวัน 09:00", dateFormat: "iso", maxDays: 14,
    fields: [
      { key: "date", label: "วันเดียว", kind: "date", param: "date" },
      { key: "start", label: "หรือ ช่วง: วันเริ่ม", kind: "date", param: "start", half: true },
      { key: "end", label: "ช่วง: วันสิ้นสุด", kind: "date", param: "end", half: true },
      { key: "dry_run", label: "ทดลอง (ดึง + คำนวณ ไม่ส่งข้อมูล)", kind: "checkbox", param: "dry_run", defaultValue: false },
    ],
  },
  {
    type: "engineon", ncacType: "engineon", name: "Engine-On",
    description: "จอดติดเครื่องจาก GPS Terminus → raw/summary engine-on",
    schedule: "อัตโนมัติทุกวัน 04:00 (logic ปัจจุบัน)", dateFormat: "dmy", maxDays: 7,
    fields: [
      ...startEnd(),
      { key: "max_distance", label: "ระยะรวมจุด (เมตร)", kind: "number", param: "max_distance", defaultValue: "200" },
      {
        key: "engine_logic", label: "Logic", kind: "select", param: "engine_logic", defaultValue: "current",
        options: [
          { value: "current", label: "ปัจจุบัน (เหมือนรอบอัตโนมัติ)" },
          { value: "v2", label: "v2 — กล่อง v1 นับจอดทุกจุดเป็นติดเครื่อง" },
        ],
      },
      { key: "rebuild_summary", label: "สร้าง trip summary ของเดือนที่กระทบใหม่", kind: "checkbox", defaultValue: true },
    ],
  },
  {
    type: "fuel-series-besttech", ncacType: "fuel_series_besttech", name: "Fuel series — Besttech",
    description: "จุด GPS + น้ำมันรายนาทีของรถ Besttech → gps_series (~76 นาที/วัน)",
    schedule: "อัตโนมัติทุกวัน 01:30", dateFormat: "dmy", maxDays: 3,
    fields: [
      ...startEnd(),
      { key: "force", label: "ดึงใหม่แม้มีข้อมูลแล้ว", kind: "checkbox", param: "force", defaultValue: false },
    ],
  },
  {
    type: "fuel-series-terminus", ncacType: "fuel_series_terminus", name: "Fuel series — Terminus",
    description: "จุด GPS + น้ำมันรายนาทีของรถ Terminus → gps_series",
    schedule: "อัตโนมัติทุกวัน 04:15 (ใน fuel nightly)", dateFormat: "dmy", maxDays: 7,
    fields: [
      ...startEnd(),
      { key: "plates", label: "ทะเบียน (ว่าง = ทุกคัน)", kind: "text", param: "plates", placeholder: "71-8623" },
    ],
  },
  {
    type: "fuel-nightly", ncacType: "fuel_nightly", name: "Fuel nightly",
    description: "รอบกลางคืน: Besttech ตามเก็บ (ถ้าขาด) → Terminus ของเมื่อวาน",
    schedule: "อัตโนมัติทุกวัน 04:15", dateFormat: "dmy", fields: [],
  },
  {
    type: "fuel-tanks", ncacType: "fuel_tanks", name: "Fuel tanks",
    description: "ขนาดถังต่อคัน (ATMS → เทียบสองกล่อง → ค่าสูงสุดที่เห็น → 200 ลิตร)",
    schedule: "รันเองเมื่อต้องการ", dateFormat: "iso",
    fields: [
      { key: "calib_from", label: "เทียบสองกล่อง ตั้งแต่ (ว่าง = 1 มิ.ย. 2026)", kind: "date", param: "calib_from", half: true },
      { key: "calib_to", label: "ถึง (ว่าง = 31 ส.ค. 2026)", kind: "date", param: "calib_to", half: true },
    ],
  },
]

/** UI type → api-ncac pipeline type (the four ETL-tab jobs + the Jobs tab). */
export const TYPE_MAP: Record<string, string> = {
  drivercost: "drivercost_ticket",
  vehiclemaster: "vehiclemaster",
  "engineon-trip-summary": "engineon_trip_summary",
  ...Object.fromEntries(JOBS.map((j) => [j.type, j.ncacType])),
}

/** Body keys each type may forward; everything else is dropped by the proxy. */
const LEGACY_PARAMS: Record<string, string[]> = {
  engineon: ["start_date", "end_date", "max_distance", "save_raw", "save_summary"],
  drivercost: ["year", "month"],
  vehiclemaster: [],
  "engineon-trip-summary": ["year", "month", "version_type"],
}

export function allowedParams(type: string): string[] {
  const job = JOBS.find((j) => j.type === type)
  const fromJob = job ? job.fields.flatMap((f) => (f.param ? [f.param] : [])) : []
  return Array.from(new Set([...(LEGACY_PARAMS[type] ?? []), ...fromJob]))
}

export function pickAllowed(type: string, body: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(allowedParams(type))
  return Object.fromEntries(
    Object.entries(body ?? {}).filter(([k, v]) => allowed.has(k) && v !== undefined && v !== null && v !== ""),
  )
}

export function initialForm(job: JobDef): FormState {
  return Object.fromEntries(job.fields.map((f) => [f.key, f.defaultValue ?? (f.kind === "checkbox" ? false : "")]))
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

const dayCount = (startIso: string, endIso: string) => (Date.parse(endIso) - Date.parse(startIso)) / DAY_MS + 1
const toDmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const text = (v: FormValue) => (typeof v === "string" ? v.trim() : "")

/** Yesterday in Bangkok as YYYY-MM-DD (what the pipelines use when no dates are sent). */
export function yesterdayBkk(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000 - DAY_MS).toISOString().slice(0, 10)
}

export function monthsBetween(startIso: string, endIso: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  let y = Number(startIso.slice(0, 4))
  let m = Number(startIso.slice(5, 7))
  const endY = Number(endIso.slice(0, 4))
  const endM = Number(endIso.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function checkRange(startIso: string, endIso: string, label: string, maxDays: number | undefined, errors: string[]) {
  if (!ISO.test(startIso) || !ISO.test(endIso)) {
    errors.push(`${label}: ต้องเลือกทั้งวันเริ่มและวันสิ้นสุด`)
    return
  }
  const days = dayCount(startIso, endIso)
  if (days < 1) errors.push(`${label}: วันสิ้นสุดต้องไม่ก่อนวันเริ่ม`)
  else if (maxDays && days > maxDays) errors.push(`${label}: ได้ไม่เกิน ${maxDays} วันต่อครั้ง (เลือกไว้ ${days} วัน)`)
}

/** Validate a Jobs-tab form and build the proxy payload (+ follow-up runs). */
export function buildRun(job: JobDef, form: FormState, now: Date = new Date()): RunPlan {
  const errors: string[] = []
  const payload: Record<string, string | number> = {}
  const fmt = (iso: string) => (job.dateFormat === "dmy" ? toDmy(iso) : iso)
  const keys = new Set(job.fields.map((f) => f.key))

  if (keys.has("start_date")) {
    const start = text(form.start_date)
    const end = text(form.end_date)
    if (start || end) {
      checkRange(start, end, "ช่วงวันที่", job.maxDays, errors)
      payload.start_date = fmt(start)
      payload.end_date = fmt(end)
    }
  }
  if (keys.has("date")) {
    const day = text(form.date)
    const start = text(form.start)
    const end = text(form.end)
    if (day && (start || end)) errors.push("เลือกได้อย่างใดอย่างหนึ่ง: วันเดียว หรือ ช่วงวันที่")
    else if (day && !ISO.test(day)) errors.push("วันเดียว: วันที่ไม่ถูกต้อง")
    else if (day) payload.date = day
    else if (start || end) {
      checkRange(start, end, "ช่วงวันที่", job.maxDays, errors)
      payload.start = start
      payload.end = end
    }
  }
  if (keys.has("calib_from")) {
    const from = text(form.calib_from)
    const to = text(form.calib_to)
    if (from || to) {
      checkRange(from, to, "ช่วงเทียบสองกล่อง", undefined, errors)
      payload.calib_from = from
      payload.calib_to = to
    }
  }
  for (const field of job.fields) {
    if (!field.param) continue
    const value = form[field.key]
    if (field.kind === "number") {
      const raw = text(value)
      if (!/^\d+$/.test(raw) || Number(raw) <= 0) errors.push(`${field.label}: ต้องเป็นจำนวนเต็มบวก`)
      else payload[field.param] = Number(raw)
    } else if (field.kind === "text") {
      const plates = text(value).split(",").map((p) => p.trim()).filter(Boolean)
      if (plates.length) payload[field.param] = plates.join(",")
    } else if (field.kind === "checkbox" && value === true) {
      payload[field.param] = "1"
    } else if (field.kind === "select") {
      const choice = text(value)
      if (!field.options?.some((o) => o.value === choice)) errors.push(`${field.label}: ตัวเลือกไม่ถูกต้อง`)
      else payload[field.param] = choice
    }
  }
  if (errors.length) return { ok: false, errors }

  const followUps: FollowUp[] = []
  if (job.type === "engineon" && form.rebuild_summary === true) {
    const start = typeof payload.start_date === "string" ? text(form.start_date) : yesterdayBkk(now)
    const end = typeof payload.end_date === "string" ? text(form.end_date) : start
    for (const { year, month } of monthsBetween(start, end)) {
      followUps.push({ type: "engineon-trip-summary", name: `Trip summary ${month}/${year}`, payload: { year, month } })
    }
  }
  return { ok: true, payload, followUps }
}

/** `/api/etl_jobs` filters: `?job_type=overspeed&limit=5` (limit 1–200, default 50). */
export function etlJobsQuery(params: URLSearchParams): { filter: Record<string, string>; limit: number } {
  const jobType = (params.get("job_type") ?? "").trim()
  const n = Number(params.get("limit"))
  return { filter: jobType ? { job_type: jobType } : {}, limit: Number.isInteger(n) && n > 0 ? Math.min(n, 200) : 50 }
}

/** "45 วิ" · "12 นาที" · "1.5 ชม." for the last-runs table. */
export function formatDuration(sec: number | null | undefined): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "-"
  if (sec < 60) return `${Math.round(sec)} วิ`
  if (sec < 3600) return `${Math.round(sec / 60)} นาที`
  return `${(sec / 3600).toFixed(1)} ชม.`
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: `ℹ pass 12`, `ℹ fail 0`

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/pipeline-jobs.ts src/lib/pipeline-jobs.test.mjs
git commit -m "feat(pipeline): Jobs tab catalog — validation, payloads, proxy allow-lists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Proxy session check and allow-list, `etl_jobs` filters, generic trigger/status

- `POST /api/pipeline/[type]` → 401 without a next-auth session (`getServerSession(authOptions)`), before anything else; then `TYPE_MAP` from Task 7; the body goes through `pickAllowed` and `STRIP_KEYS`. GET (status, health) unchanged and open.
- `GET /api/etl_jobs?job_type=overspeed&limit=5` (limit 1–200, default 50; no params = today's behaviour).
- `etlApi`: `triggerPipeline(type, payload)` / `pipelineStatus(type, jobId)` for any type; the old per-type functions stay.

**Files:**
- Modify: `src/app/api/pipeline/[type]/route.ts`
- Modify: `src/app/api/etl_jobs/route.ts`
- Modify: `src/lib/etlApi.ts`

**Interfaces:**
- Consumes: Task 7 `TYPE_MAP`, `pickAllowed`, `etlJobsQuery`; `src/lib/auth.ts` `authOptions`.
- Produces: `triggerPipeline(type: string, payload?) -> Promise<{ job_id: string }>`; `pipelineStatus(type: string, jobId: string) -> Promise<PipelineStatus>`; `type PipelineStatus = { status: "running" | "success" | "failed"; error?: string; job_id?: string; rows?: number }`.

- [ ] **Step 1: Write the failing check** — an anonymous Run must be refused before api-ncac is contacted. In an APFS clone (never in the worktree), with api-ncac pointed at a closed port so nothing reaches Render:

```bash
SMOKE=$TMPDIR/fcc-jobs-smoke; rm -rf $SMOKE; cp -c -R ~/Documents/project/fuel-control-center/fcc-jobs $SMOKE
rm $SMOKE/node_modules && cp -c -R ~/Documents/project/fuel-control-center/fuel-control-center/node_modules $SMOKE/node_modules
cd $SMOKE && NCAC_API_BASE=http://127.0.0.1:9 PORT=3917 npx next dev > dev.log 2>&1 &
sleep 15; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:3917/api/pipeline/vehiclemaster
```
Expected before the change: `502` (the proxy tried api-ncac) — the request was not refused.

- [ ] **Step 2: Implement** (three patches, `git apply` from the worktree root)

```diff
--- a/src/app/api/pipeline/[type]/route.ts
+++ b/src/app/api/pipeline/[type]/route.ts
@@ -1,30 +1,32 @@
 import { NextResponse } from "next/server"
+import { getServerSession } from "next-auth"
 
+import { authOptions } from "@/lib/auth"
+import { TYPE_MAP, pickAllowed } from "@/lib/pipeline-jobs"
+
 /**
  * Proxy to the api-ncac pipeline framework — keeps PIPELINE_API_KEY server-side.
  *
  * POST /api/pipeline/{type}  → POST {NCAC}/pipeline/run/{ncacType}   (trigger, body = params)
  * GET  /api/pipeline/{type}  → GET  {NCAC}/pipeline/status/{ncacType} (status)
  * GET  /api/pipeline/health  → GET  {NCAC}/                            (health)
+ *
+ * POST needs a signed-in session (every Run button, ETL and งานประจำ tabs) and forwards only the
+ * type's allow-listed keys — api-ncac turns each body key into an env var for the script.
  */
 
 const NCAC_BASE = process.env.NCAC_API_BASE ?? "https://api-ncac.onrender.com"
 const API_KEY = process.env.PIPELINE_API_KEY ?? ""
 
-// UI job type → api-ncac pipeline type
-const TYPE_MAP: Record<string, string> = {
-  engineon: "engineon",
-  drivercost: "drivercost_ticket",
-  vehiclemaster: "vehiclemaster",
-  "engineon-trip-summary": "engineon_trip_summary",
-}
-
 // legacy fields the old api-engineon accepted — never forward these
 const STRIP_KEYS = new Set(["phpsessid", "base_url", "index_url", "db_name", "collection_name"])
 
 type Ctx = { params: Promise<{ type: string }> | { type: string } }
 
 export async function POST(req: Request, ctx: Ctx) {
+  if (!(await getServerSession(authOptions))) {
+    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนสั่งรัน" }, { status: 401 })
+  }
   const { type } = await Promise.resolve(ctx.params)
   const ncacType = TYPE_MAP[type]
   if (!ncacType) {
@@ -38,7 +40,7 @@
     /* empty body is fine */
   }
   const params = Object.fromEntries(
-    Object.entries(body ?? {}).filter(([k]) => !STRIP_KEYS.has(k))
+    Object.entries(pickAllowed(type, body)).filter(([k]) => !STRIP_KEYS.has(k))
   )
 
   try {
```

```diff
--- a/src/app/api/etl_jobs/route.ts
+++ b/src/app/api/etl_jobs/route.ts
@@ -1,16 +1,19 @@
 import { NextResponse } from "next/server"
 import clientPromise from "@/lib/mongodb"
+import { etlJobsQuery } from "@/lib/pipeline-jobs"
 
-export async function GET() {
+// ?job_type=overspeed&limit=5 → the last runs of one job (Jobs tab cards); no params → last 50 of all
+export async function GET(req: Request) {
+  const { filter, limit } = etlJobsQuery(new URL(req.url).searchParams)
   try {
     const client = await clientPromise
     const db = client.db("analytics")
 
     const jobs = await db
       .collection("etl_jobs")
-      .find({})
+      .find(filter)
       .sort({ start_time: -1 })
-      .limit(50)
+      .limit(limit)
       .toArray()
 
     return NextResponse.json(jobs)
```

```diff
--- a/src/lib/etlApi.ts
+++ b/src/lib/etlApi.ts
@@ -5,9 +5,15 @@
  * Job model: POST returns { job_id: "<type>:<triggerMs>" }. Status polling hits
  * GET /api/pipeline/{type} → { running, last_run } (last_run = analytics.etl_jobs doc)
  * and reports success/failed once a job-log created after the trigger completes.
+ * `type` is any key of TYPE_MAP in lib/pipeline-jobs.
  */
 
-type UiJobType = "engineon" | "drivercost" | "vehiclemaster" | "engineon-trip-summary"
+export type PipelineStatus = {
+  status: "running" | "success" | "failed"
+  error?: string
+  job_id?: string
+  rows?: number
+}
 
 /** how long we wait for the subprocess to write its job log before failing */
 const START_GRACE_MS = 60_000
@@ -26,7 +32,7 @@
 /* -----------------------------
    Trigger + status core
 ------------------------------ */
-async function trigger(type: UiJobType, payload?: Record<string, unknown>) {
+async function trigger(type: string, payload?: Record<string, unknown>) {
   const res = await fetch(`/api/pipeline/${type}`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
@@ -40,7 +46,7 @@
   return data as { job_id: string }
 }
 
-async function status(type: UiJobType, jobId: string) {
+async function status(type: string, jobId: string): Promise<PipelineStatus> {
   const triggeredAt = Number(jobId.split(":").pop()) || 0
 
   const res = await fetch(`/api/pipeline/${type}`, { cache: "no-store" })
@@ -114,3 +120,12 @@
 export async function engineOnTripSummaryStatus(jobId: string) {
   return status("engineon-trip-summary", jobId)
 }
+
+/* ---------------- Any pipeline (Jobs tab, generic polling) ---------------- */
+export async function triggerPipeline(type: string, payload?: Record<string, unknown>) {
+  return trigger(type, payload)
+}
+
+export async function pipelineStatus(type: string, jobId: string) {
+  return status(type, jobId)
+}
```

- [ ] **Step 3: Verify**

Re-copy the changed files into the clone (`cp -c` each) and repeat the curl → `401`; `curl -s http://localhost:3917/api/pipeline/health` → `{"status":"error"}` (open, unchanged). Stop the dev server and delete the clone.
Run in the worktree: `npx tsc --noEmit -p tsconfig.json` → exit 0; `npx eslint "src/app/api/pipeline/[type]/route.ts" src/app/api/etl_jobs/route.ts src/lib/etlApi.ts` → no new problems (the pre-existing `no-explicit-any` errors in `etlApi.ts` and the route's `catch (e: any)` stay as they were).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/pipeline/[type]/route.ts" src/app/api/etl_jobs/route.ts src/lib/etlApi.ts
git commit -m "feat(pipeline): signed-in Run only, per-type parameter allow-list, etl_jobs filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: The งานประจำ tab

- `/pipeline` gets two tabs, **ETL** (the four original buttons, unchanged) and **งานประจำ**; the queue, polling and timeline below are shared. Polling becomes generic (`pipelineStatus(type, jobId)`), which is what the four old per-type functions already did.
- One card per `JOBS` entry: name, Thai description, read-only schedule, last 5 runs (status, start, duration, records; error on hover), **Run** → `RunJobModal` (built on `BaseRunModal`, mounted with `key={job.type}` so each open starts from the defaults — no state reset in an effect, which the repo's `react-hooks/set-state-in-effect` rule rejects). Cards reload their runs whenever a queued run finishes.
- `BaseRunModal` gains `runLabel` (default "Run ETL") and opens full-screen below `sm` (spec: "the form opens full-screen"); desktop unchanged.

**Files:**
- Modify: `src/components/pipeline/BaseRunModal.tsx`
- Create: `src/components/pipeline/RunJobModal.tsx`
- Create: `src/components/pipeline/JobsTab.tsx`
- Modify: `src/app/pipeline/page.tsx`

**Interfaces:**
- Consumes: Task 7 `JOBS`, `JobDef`, `JobField`, `FormState`, `FormValue`, `initialForm`, `buildRun`, `formatDuration`; Task 8 `triggerPipeline`, `pipelineStatus`.
- Produces: `type QueueFn = (type: string, name: string, run: () => Promise<{ job_id?: string }>) => void`; `<JobsTab onQueue refreshKey />`; `<RunJobModal job onClose onQueue />`.

- [ ] **Step 1: BaseRunModal** (apply with `git apply`)

```diff
--- a/src/components/pipeline/BaseRunModal.tsx
+++ b/src/components/pipeline/BaseRunModal.tsx
@@ -9,6 +9,8 @@
   loading?: boolean
   onClose: () => void
   onRun: () => void
+  /** run button text (default "Run ETL") */
+  runLabel?: string
   children: ReactNode
 }
 
@@ -18,13 +20,15 @@
   loading,
   onClose,
   onRun,
+  runLabel = "Run ETL",
   children,
 }: Props) {
   if (!open) return null
 
   return (
-    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
-      <div className="bg-white w-full max-w-lg rounded-xl shadow-lg p-6 space-y-4">
+    // full-screen on phones, centred card from sm up
+    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center">
+      <div className="bg-white w-full h-full overflow-y-auto sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl shadow-lg p-6 space-y-4">
         <h2 className="text-lg font-semibold">{title}</h2>
 
         {children}
@@ -34,7 +38,7 @@
             Cancel
           </Button>
           <Button onClick={onRun} disabled={loading}>
-            {loading ? "Running..." : "Run ETL"}
+            {loading ? "Running..." : runLabel}
           </Button>
         </div>
       </div>
```

- [ ] **Step 2: The form modal**

```tsx file=src/components/pipeline/RunJobModal.tsx
"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { triggerPipeline } from "@/lib/etlApi"
import { buildRun, initialForm, type FormState, type FormValue, type JobDef, type JobField } from "@/lib/pipeline-jobs"

export type QueueFn = (type: string, name: string, run: () => Promise<{ job_id?: string }>) => void

interface Props {
  job: JobDef
  onClose: () => void
  onQueue: QueueFn
}

/** Parameter form for one Jobs-tab card. Mount with key={job.type} so each open starts from the defaults. */
export default function RunJobModal({ job, onClose, onQueue }: Props) {
  const [form, setForm] = useState<FormState>(() => initialForm(job))
  const [errors, setErrors] = useState<string[]>([])

  const handleRun = () => {
    const plan = buildRun(job, form)
    if (!plan.ok) {
      setErrors(plan.errors)
      return
    }
    onQueue(job.type, job.name, () => triggerPipeline(job.type, plan.payload))
    for (const next of plan.followUps) onQueue(next.type, next.name, () => triggerPipeline(next.type, next.payload))
    onClose()
  }

  return (
    <BaseRunModal open title={`▶ ${job.name}`} onClose={onClose} onRun={handleRun} runLabel="Run">
      <p className="text-sm text-gray-600">{job.description}</p>
      {job.fields.length === 0 && <p className="text-sm text-gray-500">งานนี้ไม่มีพารามิเตอร์ — กด Run เพื่อเข้าคิว</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {job.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={form[field.key]}
            onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
          />
        ))}
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-red-600">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </BaseRunModal>
  )
}

function Field({ field, value, onChange }: { field: JobField; value: FormValue; onChange: (v: string | boolean) => void }) {
  const id = `job-field-${field.key}`
  const span = field.half ? "" : "sm:col-span-2"
  const inputClass = "mt-1 w-full border rounded px-3 py-2 text-sm"

  if (field.kind === "checkbox") {
    return (
      <label htmlFor={id} className={`${span} flex items-center gap-2 text-sm`}>
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }

  return (
    <div className={span}>
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
      </label>
      {field.kind === "select" ? (
        <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.kind}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          min={field.kind === "number" ? 1 : undefined}
          step={field.kind === "number" ? 1 : undefined}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: The tab**

```tsx file=src/components/pipeline/JobsTab.tsx
"use client"

import { useEffect, useState } from "react"
import dayjs from "dayjs"
import { Button } from "@/components/ui/button"
import { JOBS, formatDuration, type JobDef } from "@/lib/pipeline-jobs"
import RunJobModal, { type QueueFn } from "./RunJobModal"

interface EtlRun {
  _id: string
  status: string
  start_time?: string
  duration_sec?: number | null
  records?: number
  error?: string | null
}

/** งานประจำ tab: one card per scheduled job — schedule (read-only), last 5 runs, Run → parameter form. */
export default function JobsTab({ onQueue, refreshKey }: { onQueue: QueueFn; refreshKey: number }) {
  const [openJob, setOpenJob] = useState<JobDef | null>(null)

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {JOBS.map((job) => (
        <article key={job.type} className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">{job.name}</h3>
              <p className="text-sm text-gray-600">{job.description}</p>
              <p className="mt-1 text-xs text-gray-500">🕒 {job.schedule}</p>
            </div>
            <Button onClick={() => setOpenJob(job)}>▶ Run</Button>
          </div>
          <RecentRuns jobType={job.ncacType} refreshKey={refreshKey} />
        </article>
      ))}

      {openJob && (
        <RunJobModal key={openJob.type} job={openJob} onClose={() => setOpenJob(null)} onQueue={onQueue} />
      )}
    </section>
  )
}

/** Last 5 etl_jobs rows of one pipeline; refetched whenever a queued run finishes (refreshKey). */
function RecentRuns({ jobType, refreshKey }: { jobType: string; refreshKey: number }) {
  const [runs, setRuns] = useState<EtlRun[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/etl_jobs?job_type=${encodeURIComponent(jobType)}&limit=5`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (alive) setRuns(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (alive) setRuns([])
      })
    return () => {
      alive = false
    }
  }, [jobType, refreshKey])

  if (runs === null) return <p className="text-xs text-gray-400">กำลังโหลดประวัติ…</p>
  if (runs.length === 0) return <p className="text-xs text-gray-400">ยังไม่มีประวัติการรัน</p>

  return (
    <table className="w-full text-xs">
      <thead className="text-gray-500">
        <tr>
          <th className="text-left font-normal">ผล</th>
          <th className="text-left font-normal">เริ่ม</th>
          <th className="text-left font-normal">ใช้เวลา</th>
          <th className="text-right font-normal">records</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r._id} className="border-t">
            <td className="py-1" title={r.error ?? undefined}>
              <RunStatus status={r.status} />
              {r.error ? " ⓘ" : ""}
            </td>
            <td>{r.start_time ? dayjs(r.start_time).format("DD/MM HH:mm") : "-"}</td>
            <td>{formatDuration(r.duration_sec)}</td>
            <td className="text-right">{typeof r.records === "number" ? r.records.toLocaleString() : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RunStatus({ status }: { status: string }) {
  if (status === "success") return <span className="text-green-600">🟢 สำเร็จ</span>
  if (status === "running") return <span className="text-yellow-600">🟡 กำลังรัน</span>
  return <span className="text-red-600">🔴 ล้มเหลว</span>
}
```

- [ ] **Step 4: Page tabs and generic polling** (apply with `git apply`)

```diff
--- a/src/app/pipeline/page.tsx
+++ b/src/app/pipeline/page.tsx
@@ -6,26 +6,22 @@
 import utc from "dayjs/plugin/utc"
 import { Button } from "@/components/ui/button"
 
-import {
-  healthz,
-  engineOnStatus,
-  driverCostStatus,
-  vehicleMasterStatus,
-  engineOnTripSummaryStatus,
-} from "@/lib/etlApi"
+import { healthz, pipelineStatus } from "@/lib/etlApi"
 
 import RunEngineOnModal from "@/components/pipeline/RunEngineOnModal"
 import RunDriverCostModal from "@/components/pipeline/RunDriverCostModal"
 import RunVehicleMasterModal from "@/components/pipeline/RunVehicleMasterModal"
 import RunTripSummaryModal from "@/components/pipeline/RunTripSummaryModal"
 import EtlJobsModal from "@/components/pipeline/EtlJobsModal"
+import JobsTab from "@/components/pipeline/JobsTab"
 
 dayjs.extend(utc)
 dayjs.extend(relativeTime)
 
 /* ---------------- Types ---------------- */
 
-type JobType = "engineon" | "drivercost" | "vehiclemaster" | "engineon-trip-summary"
+/** any /api/pipeline type — TYPE_MAP in lib/pipeline-jobs */
+type JobType = string
 type JobStatus = "queued" | "running" | "success" | "failed"
 
 type RunFn = () => Promise<{ job_id?: string }>
@@ -49,10 +45,17 @@
   run: RunFn
 }
 
+const TABS = [
+  { key: "etl", label: "ETL" },
+  { key: "jobs", label: "งานประจำ" },
+] as const
+type Tab = (typeof TABS)[number]["key"]
+
 /* ---------------- Page ---------------- */
 
 export default function PipelinePage() {
   const [health, setHealth] = useState<any>(null)
+  const [tab, setTab] = useState<Tab>("etl")
 
   const [jobs, setJobs] = useState<Job[]>([])
   const [queue, setQueue] = useState<QueuedJob[]>([])
@@ -67,6 +70,8 @@
   const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
 
   const runningJob = useMemo(() => jobs.find((j) => j.status === "running"), [jobs])
+  // bumps when a queued run ends → Jobs tab cards reload their last runs
+  const finishedCount = jobs.filter((j) => j.status === "success" || j.status === "failed").length
 
   /* -------- Health -------- */
   useEffect(() => {
@@ -166,32 +171,17 @@
 
     pollingRef.current = setInterval(async () => {
       try {
-        let res: any
+        const res = await pipelineStatus(runningJob.type, runningJob.jobId!)
 
-        switch (runningJob.type) {
-          case "engineon":
-            res = await engineOnStatus(runningJob.jobId!)
-            break
-          case "drivercost":
-            res = await driverCostStatus(runningJob.jobId!)
-            break
-          case "vehiclemaster":
-            res = await vehicleMasterStatus(runningJob.jobId!)
-            break
-          case "engineon-trip-summary":
-            res = await engineOnTripSummaryStatus(runningJob.jobId!)
-            break
-        }
-
-        if (res?.status === "success" || res?.status === "failed") {
+        if (res.status === "success" || res.status === "failed") {
           setJobs((prev) =>
             prev.map((j) =>
               j.localId === runningJob.localId
                 ? {
                     ...j,
                     status: res.status,
-                    finishedAt: res.finished_at ?? new Date().toISOString(),
-                    message: res?.error ?? j.message,
+                    finishedAt: new Date().toISOString(),
+                    message: res.error ?? j.message,
                   }
                 : j
             )
@@ -232,14 +222,35 @@
         </Button>
       </section>
 
-      {/* Actions */}
-      <section className="grid grid-cols-2 gap-4">
-        <Button onClick={() => setOpenEngineOn(true)}>🔥 Run Engine-On</Button>
-        <Button onClick={() => setOpenDriverCost(true)}>💰 Driver Cost</Button>
-        <Button onClick={() => setOpenVehicleMaster(true)}>🚚 Vehicle Master</Button>
-        <Button onClick={() => setOpenTripSummary(true)}>📊 Trip Summary</Button>
-      </section>
+      {/* Tabs — ETL (the original buttons) | งานประจำ (scheduled jobs); both feed the queue below */}
+      <nav role="tablist" className="flex gap-1 border-b">
+        {TABS.map((t) => (
+          <button
+            key={t.key}
+            type="button"
+            role="tab"
+            aria-selected={tab === t.key}
+            onClick={() => setTab(t.key)}
+            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
+              tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"
+            }`}
+          >
+            {t.label}
+          </button>
+        ))}
+      </nav>
 
+      {tab === "etl" ? (
+        <section className="grid grid-cols-2 gap-4">
+          <Button onClick={() => setOpenEngineOn(true)}>🔥 Run Engine-On</Button>
+          <Button onClick={() => setOpenDriverCost(true)}>💰 Driver Cost</Button>
+          <Button onClick={() => setOpenVehicleMaster(true)}>🚚 Vehicle Master</Button>
+          <Button onClick={() => setOpenTripSummary(true)}>📊 Trip Summary</Button>
+        </section>
+      ) : (
+        <JobsTab onQueue={enqueue} refreshKey={finishedCount} />
+      )}
+
       {/* Timeline */}
       <section className="bg-white border rounded-xl shadow-sm">
         <div className="p-4 border-b font-semibold">📈 ETL Timeline</div>
```

- [ ] **Step 5: Verify**

Run: `npm test` → `ℹ pass 12`
Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
Run: `npx eslint src/components/pipeline src/app/pipeline src/lib/etlApi.ts src/lib/pipeline-jobs.ts src/lib/pipeline-jobs.test.mjs "src/app/api/pipeline" src/app/api/etl_jobs` → the new files are clean and the total does not grow (before this part: 7 errors, 3 warnings in these files, all pre-existing; after: 6 errors, 3 warnings — `let res: any` is gone).
Run the production build in an APFS clone (Turbopack refuses the symlinked `node_modules`):

```bash
BUILD=$TMPDIR/fcc-jobs-build; rm -rf $BUILD; cp -c -R ~/Documents/project/fuel-control-center/fcc-jobs $BUILD
rm $BUILD/node_modules && cp -c -R ~/Documents/project/fuel-control-center/fuel-control-center/node_modules $BUILD/node_modules
cd $BUILD && MONGO_URI=mongodb://127.0.0.1:9 npx next build > build.log 2>&1; echo "exit $?"; grep -E "pipeline|rror" build.log | head
```
Expected: `exit 0`, `/pipeline` and `/api/pipeline/[type]` listed (`src/lib/mongodb.ts` throws at import without `MONGO_URI`; the dummy local URI keeps real credentials out of the clone). Delete the clone afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/components/pipeline/BaseRunModal.tsx src/components/pipeline/RunJobModal.tsx src/components/pipeline/JobsTab.tsx src/app/pipeline/page.tsx
git commit -m "feat(pipeline): งานประจำ tab — job cards, last runs, parameter forms on the shared queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part C — Smoke runs (scratch collections / DRY_RUN only)

### Task 10: Smokes against production data, nothing written to production collections

Run every pipeline through a wrapper that swaps `JobLog` for a local recorder, so the smokes add nothing to `analytics.etl_jobs` (the cards would otherwise show scratch runs as real ones). Keep the wrapper and all logs in the session scratchpad, not in the repo.

```python
# $SCRATCH/smoke_run.py SCRIPT — run a pipeline's main() with JobLog replaced by a local recorder
import json, runpy, sys
sys.path.insert(0, sys.argv[2])                     # <worktree>/scripts/engineon
import common
class LocalJob:
    def __init__(self, job_type, pipeline, meta=None):
        print("JOB start", job_type, json.dumps(meta, default=str, ensure_ascii=False))
    def finish(self, status="success", **extra):
        print("JOB finish", status, json.dumps(extra, default=str, ensure_ascii=False)[:4000])
common.JobLog = LocalJob
sys.argv = [sys.argv[1]]
runpy.run_path(sys.argv[0], run_name="__main__")
```

- [ ] **Step 1: ⚠️ PROD write (allowed once) — seed `analytics.rmc_vehicles`**

```bash
.venv/bin/python scripts/rmc/seed_rmc.py ~/Documents/project/schedule_fuel/Cpac_compen/compensation_cpac/vehicle.json
```
Expected: `rmc_vehicles: 591 rows`. No `--state` (that is the user's cutover step).

- [ ] **Step 2: ⚠️ PROD read — overspeed for one past day into `analytics.overspeed_smoke`**

Pick the day: the newest `analytics.overspeed` document by `_id` (index) gives the last day the old script wrote; use that day if it is ≥ 01/03/2026 (driving_log retention). Then:

```bash
OVERSPEED_COLLECTION=overspeed_smoke START_DATE=DD/MM/YYYY END_DATE=DD/MM/YYYY \
  /usr/bin/time -l .venv/bin/python $SCRATCH/smoke_run.py scripts/overspeed/pipeline_overspeed.py scripts/engineon > $SCRATCH/overspeed_smoke.log 2>&1
```
Compare with `analytics.overspeed` for the same day through its `vehicle_1_start_datetime_1_speed_group_1` index (`vehicle $in` the day's plates, `start_datetime` in the day): row counts per speed group, plates, and per-row equality of `vehicle, start_datetime, end_datetime, records, duration_minutes, max_speed, avg_speed, w_speed, speed_group`. Report wall time and maximum resident set size. Drop `analytics.overspeed_smoke`.

- [ ] **Step 3: RMC dry run for yesterday** (CPAC fleetlink read only; no push, no state)

```bash
DRY_RUN=true DATE=YYYY-MM-DD .venv/bin/python $SCRATCH/smoke_run.py scripts/rmc/pipeline_rmc.py scripts/engineon > $SCRATCH/rmc_smoke.log 2>&1
```
Expected: `JOB finish success` with one day: `fetched` > 0, `dropped` small, `rows` > 0, `pushed: false`. Compare `rows` with the Mac job's log for that day if one exists. Confirm `analytics.etl_state` still has no `rmc_compensation` doc.

- [ ] **Step 4: ⚠️ PROD read — engine-on v2 for one day into `*_smoke`**

```bash
ENGINE_LOGIC=v2 ENGINEON_RAW_COLLECTION=raw_engineon_smoke ENGINEON_SUMMARY_COLLECTION=summary_engineon_smoke \
  START_DATE=DD/MM/YYYY END_DATE=DD/MM/YYYY \
  /usr/bin/time -l .venv/bin/python $SCRATCH/smoke_run.py scripts/engineon/pipeline_engineon.py scripts/engineon > $SCRATCH/engineon_smoke.log 2>&1
```
Compare `summary_engineon_smoke` with `summary_engineon` for that day (same plates; v2 boxes' minutes equal; v1 boxes' minutes ≥ today's; every smoke record has `engine_logic: "v2"` and `confirmed_by_voltage` = (`version_type == "v2"`)). Drop both `*_smoke` collections.

---

## After Part 4 (the user's steps — not part of these tasks)

1. Review, then merge `feat/jobs-tab` into each repo's `main` and push (api-ncac `main` auto-deploys to Render, fuel-control-center `main` to Vercel).
2. Render env: add `API_PUSH`, and `POST_URL` if it is not already set for the cpac pipeline (same value).
3. RMC cutover: seed the state from the Mac — `.venv/bin/python scripts/rmc/seed_rmc.py ~/Documents/project/schedule_fuel/Cpac_compen/compensation_cpac/vehicle.json --state ~/Documents/project/schedule_fuel/Cpac_compen/compensation_cpac/rmc_daily/state.json` (re-seeds the mapping too). Let Render and the Mac both run for 3 days (pushes are upserts), compare the daily counts on the card with the Mac logs, then `launchctl unload ~/Library/LaunchAgents/com.cpac.rmc-daily.plist` and archive `~/Documents/project/schedule_fuel/Cpac_compen`.
4. Rotate the Mongo password that is typed into `cal_overspeed/etl_overspeed_v4.py`, and stop running that script (the 04:30 job replaces it).
5. The 32 zero-row RMC days (2026-07-29 → 2026-09-27): three manual runs (`START`/`END`, ≤ 14 days each) from the card — only when you decide to re-push them.
