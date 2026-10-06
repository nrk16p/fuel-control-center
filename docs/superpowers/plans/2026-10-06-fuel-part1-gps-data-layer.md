# Fuel Redesign Part 1 — GPS Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nightly jobs in api-ncac that turn Terminus and Besttech GPS readings into one compact `analytics.gps_series` document per truck × day × source, plus tank sizes, backfill, and a matching TypeScript decoder in fuel-control-center.

**Architecture:** Pure, unit-tested modules in `api-ncac/scripts/fuel/` (plates, dates, codec, series builder, store, Besttech client, tank helpers) are wired into pipeline scripts that follow the engine-on conventions (`JobLog` → `analytics.etl_jobs`, `START_DATE`/`END_DATE` env, registration in `routes/pipeline/pipeline_routes.py`, UTC cron in `main.py`). Readings are bucketed per minute and stored as packed little-endian binary columns. The fuel-control-center gets a decoder with a cross-language fixture test so Part 3 can read the same bytes.

**Tech Stack:** Python 3.11+ (numpy, pymongo, requests — already in `requirements.txt`), pytest (dev only), Node 25 built-in test runner with TypeScript type stripping.

**Spec:** `docs/superpowers/specs/2026-10-06-fuel-detection-redesign-design.md` (this repo) — §3 Part 1, §6, §7, §9. Read it alongside this plan.

## Global Constraints

- Work only in worktrees: api-ncac → `~/Documents/project/ncac/api-ncac-fuel` (branch `feat/fuel-gps-series` from `origin/main`); fuel-control-center → `~/Documents/project/fuel-control-center/fcc-fuel` (branch `feat/fuel-redesign`). The main api-ncac checkout is behind `origin/main`; never branch from it.
- Never push. api-ncac `main` auto-deploys to Render and fuel-control-center `main` to Vercel; pushing and merging happen only after the user approves.
- Steps marked **⚠️ PROD** write to the production Mongo cluster or call Besttech at volume. Ask the user before running each one.
- No new runtime dependencies in `requirements.txt`. `pytest` goes in `requirements-dev.txt`.
- Scheduler `CronTrigger` hours in `main.py` are UTC (BKK − 7); the `tz` argument does not apply.
- Plates: `\d{2}-\d{4}` → `สบ.xx-xxxx`; any other non-empty format kept trimmed (same rule as mongodb-gps `app/utils/plate.py`).
- `gps_series._id` = `"{plate}|{YYYY-MM-DD}|{source}"`; `date` = 00:00 Thai time as naive UTC; TTL 400 days on `date`.
- Codec enc version 1, little-endian: `m` uint16, `fuel`/`fuel_lo`/`fuel_hi` int16 in `fuel_unit` (`dl` deci-litres for Terminus, `cpct` centi-percent for Besttech, −1 = no valid reading), `speed` uint8, `engine` uint8, `lat`/`lng` int32 degrees × 1e5 (0 = no position).
- Besttech: `Authorization: Bearer <key>`, body via `json=` (plain `application/json`; a charset suffix returns HTTP 415), ≥ 35 s between calls by default, `error.TooManyRequests` arrives as HTTP 200, pause 09:00–10:00 BKK (mongodb-gps ingests at 09:25 with the same key).
- Every job logs through `JobLog` from `scripts/engineon/common.py` and loads env from `scripts/.env` (gitignored).

## Review Focus

- A Besttech box swap (two vehicle codes reporting the same plate on one day) must produce one document per plate holding both codes' points — Task 6 `test_box_swap_two_codes_one_plate_merges`.
- A Besttech outage for some hours must still write the day from the hours that answered, with `max_gap_min` showing the hole — Task 6 `test_empty_hours_still_build_the_day`.
- Vendor points stamped outside the requested day (window edges) must be dropped, not written into a neighbouring day — Task 6 `test_points_outside_the_day_are_dropped`.
- Plates outside `xx-xxxx` (e.g. `กว4506`, 15 of 424 Terminus trucks) must survive normalization, Terminus documents and the `PLATES` filter — Task 1 `test_normalize_keeps_other_formats_trimmed`, `test_terminus_plate`; Task 7 `test_docs_per_plate_in_litres`.
- Re-running a day (`FORCE=1`, restarted backfill) must replace documents, never duplicate them — Task 3 `test_same_inputs_give_same_id`; Task 4 `test_upsert_series_replaces_by_id`.

---

### Task 1: Worktree, test environment, plate and date helpers

**Files:**
- Create: `requirements-dev.txt`
- Create: `scripts/fuel/plates.py`
- Create: `scripts/fuel/dates.py`
- Create: `scripts/fuel/tests/conftest.py`
- Test: `scripts/fuel/tests/test_plates.py`, `scripts/fuel/tests/test_dates.py`

**Interfaces:**
- Produces: `normalize_plate(raw) -> str | None`, `terminus_plate(plate: str) -> str`, `split_besttech_vehicle(raw) -> tuple[str | None, str | None]`, `PLATE_PREFIX = "สบ."`; `parse_day(text) -> date`, `parse_days(start, end) -> list[date]`, `parse_date_list(text) -> list[date]`, `ddmmyyyy(day) -> str`.

- [ ] **Step 1: Create the worktree and local env**

```bash
cd ~/Documents/project/ncac/api-ncac
git fetch origin
git worktree add -b feat/fuel-gps-series ../api-ncac-fuel origin/main
cd ../api-ncac-fuel
{ cat ../api-ncac/scripts/.env; echo; cat ~/Documents/project/besttech/.env; } > scripts/.env
chmod 600 scripts/.env
grep -oE '^(MONGODB_URI|BESTTECH_API)=' scripts/.env
```
Expected: both `MONGODB_URI=` and `BESTTECH_API=` printed (values are not shown).

- [ ] **Step 2: Add the dev requirements and create the venv**

Create `requirements-dev.txt`:
```
# Local test/run env for scripts/fuel on macOS — Render installs requirements.txt only
numpy
pymongo
requests
python-dotenv
urllib3
pytest>=8
```
Run:
```bash
python3 -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt && .venv/bin/python -m pytest --version
```
Expected: `pytest 8.x` (or newer).

- [ ] **Step 3: Write `scripts/fuel/tests/conftest.py`**

```python
import sys
from pathlib import Path

# Pipeline scripts import their siblings by module name (they run as files), so tests do the same.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

- [ ] **Step 4: Write the failing tests**

`scripts/fuel/tests/test_plates.py`:
```python
from plates import normalize_plate, split_besttech_vehicle, terminus_plate


def test_normalize_standard_forms():
    assert normalize_plate("71-8623") == "สบ.71-8623"
    assert normalize_plate("สบ.71-0043") == "สบ.71-0043"
    assert normalize_plate("71-1191(Menatransport)") == "สบ.71-1191"
    assert normalize_plate("71 – 1191") == "สบ.71-1191"


def test_normalize_keeps_other_formats_trimmed():
    assert normalize_plate("  กว4506 ") == "กว4506"
    assert normalize_plate("3ฒภ5383") == "3ฒภ5383"


def test_normalize_empty():
    assert normalize_plate(None) is None
    assert normalize_plate("   ") is None
    assert normalize_plate(float("nan")) is None


def test_split_besttech_vehicle():
    assert split_besttech_vehicle("ME152 (71-8635 สบ.)") == ("ME152", "สบ.71-8635")
    assert split_besttech_vehicle("70-6294 สบ.") == (None, "สบ.70-6294")
    assert split_besttech_vehicle("") == (None, None)


def test_terminus_plate():
    assert terminus_plate("สบ.71-8623") == "71-8623"
    assert terminus_plate("71-8623") == "71-8623"
    assert terminus_plate("กว4506") == "กว4506"
```

`scripts/fuel/tests/test_dates.py`:
```python
from datetime import date

import pytest

from dates import ddmmyyyy, parse_date_list, parse_days


def test_parse_days_is_inclusive():
    assert parse_days("30/09/2026", "02/10/2026") == [date(2026, 9, 30), date(2026, 10, 1), date(2026, 10, 2)]


def test_parse_days_single_day():
    assert parse_days("05/10/2026", "05/10/2026") == [date(2026, 10, 5)]


def test_parse_days_rejects_reversed_range():
    with pytest.raises(ValueError):
        parse_days("05/10/2026", "01/10/2026")


def test_parse_date_list_sorts_and_dedupes():
    assert parse_date_list("15/06/2026, 01/06/2026,15/06/2026,") == [date(2026, 6, 1), date(2026, 6, 15)]


def test_ddmmyyyy():
    assert ddmmyyyy(date(2026, 3, 1)) == "01/03/2026"
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest scripts/fuel/tests -q`
Expected: errors `ModuleNotFoundError: No module named 'plates'` and `'dates'`.

- [ ] **Step 6: Implement `scripts/fuel/plates.py`**

```python
"""Plate normalisation shared by the fuel series jobs (spec §3.1).

Same rule as menatransport/mongodb-gps app/utils/plate.py so gps_series joins gps.distance_*
and ATMS: digits "xx-xxxx" -> "สบ.xx-xxxx". Other non-empty formats (about 15 of 424 Terminus
trucks, e.g. "กว4506", "3ฒภ5383") are kept trimmed instead of dropped.
"""
import re

PLATE_PREFIX = "สบ."
_PLATE_RE = re.compile(r"(\d{2})\s*[-–—]\s*(\d{4})")
_BESTTECH_RE = re.compile(r"^(\S+)\s*\((.*)\)\s*$")


def normalize_plate(raw) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text.lower() == "nan":
        return None
    match = _PLATE_RE.search(text)
    if not match:
        return text
    return f"{PLATE_PREFIX}{match.group(1)}-{match.group(2)}"


def terminus_plate(plate: str) -> str:
    """'สบ.71-8623' -> '71-8623', the form stored in terminus.driving_log."""
    text = (plate or "").strip()
    match = _PLATE_RE.search(text)
    return f"{match.group(1)}-{match.group(2)}" if match else text


def split_besttech_vehicle(raw) -> tuple[str | None, str | None]:
    """'ME152 (71-8635 สบ.)' -> ('ME152', 'สบ.71-8635'); '70-6294 สบ.' -> (None, 'สบ.70-6294')."""
    if not raw:
        return None, None
    text = str(raw).strip()
    match = _BESTTECH_RE.match(text)
    if match:
        return match.group(1), normalize_plate(match.group(2))
    return None, normalize_plate(text)
```

- [ ] **Step 7: Implement `scripts/fuel/dates.py`**

```python
"""Date helpers for the fuel jobs — env dates use dd/mm/YYYY like the engine-on pipeline."""
from datetime import date, datetime, timedelta


def parse_day(text: str) -> date:
    return datetime.strptime(text.strip(), "%d/%m/%Y").date()


def parse_days(start: str, end: str) -> list[date]:
    first, last = parse_day(start), parse_day(end)
    if last < first:
        raise ValueError(f"END_DATE {end} is before START_DATE {start}")
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def parse_date_list(text: str) -> list[date]:
    return sorted({parse_day(part) for part in text.split(",") if part.strip()})


def ddmmyyyy(day: date) -> str:
    return day.strftime("%d/%m/%Y")
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest scripts/fuel/tests -q`
Expected: `10 passed`.

- [ ] **Step 9: Commit**

```bash
git add requirements-dev.txt scripts/fuel/plates.py scripts/fuel/dates.py scripts/fuel/tests/conftest.py scripts/fuel/tests/test_plates.py scripts/fuel/tests/test_dates.py
git commit -m "feat(fuel): plate/date helpers + pytest setup for scripts/fuel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Series codec (Python)

**Files:**
- Create: `scripts/fuel/series_codec.py`
- Test: `scripts/fuel/tests/test_series_codec.py`

**Interfaces:**
- Produces: `ENC_VERSION = 1`, `FUEL_MISSING = -1`, `COLUMNS: dict[str, str]` (name → numpy dtype), `encode_columns(cols: dict[str, np.ndarray]) -> dict[str, bytes]`, `decode_column(raw: bytes, name: str, n: int) -> np.ndarray`, `decode_columns(raw: dict[str, bytes], n: int) -> dict[str, np.ndarray]`, `fuel_to_int(values, unit: str) -> np.ndarray[int16]`, `fuel_to_litres(values, unit: str, tank_l: float) -> np.ndarray[float]` (NaN where missing), `deg_to_int(values) -> np.ndarray[int32]`, `int_to_deg(values) -> np.ndarray[float]`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_series_codec.py`:
```python
import numpy as np
import pytest

from series_codec import (COLUMNS, FUEL_MISSING, decode_column, decode_columns, deg_to_int, encode_columns,
                          fuel_to_int, fuel_to_litres, int_to_deg)


def sample(n=3):
    return {
        "m": np.array([0, 1, 1439][:n]),
        "fuel": np.array([1824, FUEL_MISSING, 0][:n]),
        "fuel_lo": np.array([1800, FUEL_MISSING, 0][:n]),
        "fuel_hi": np.array([1850, FUEL_MISSING, 0][:n]),
        "speed": np.array([0, 45, 255][:n]),
        "engine": np.array([0, 1, 1][:n]),
        "lat": np.array([1379576, 0, 1428651][:n]),
        "lng": np.array([10055717, 0, 10078388][:n]),
    }


def test_round_trip():
    cols = sample()
    raw = encode_columns(cols)
    assert set(raw) == set(COLUMNS)
    back = decode_columns(raw, 3)
    for name in COLUMNS:
        assert back[name].tolist() == cols[name].tolist()


def test_decode_single_column():
    raw = encode_columns(sample())
    assert decode_column(raw["fuel_hi"], "fuel_hi", 3).tolist() == [1850, -1, 0]


def test_little_endian_layout():
    raw = encode_columns({**sample(2), "m": np.array([1, 256])})
    assert raw["m"] == b"\x01\x00\x00\x01"
    assert len(raw["lat"]) == 8 and len(raw["speed"]) == 2


def test_length_mismatch_raises():
    cols = sample()
    cols["speed"] = np.array([1, 2])
    with pytest.raises(ValueError):
        encode_columns(cols)


def test_missing_column_raises():
    cols = sample()
    del cols["lng"]
    with pytest.raises(ValueError):
        encode_columns(cols)


def test_fuel_scaling_litres_and_percent():
    assert fuel_to_int([182.44, None, -1, float("nan")], "dl").tolist() == [1824, -1, -1, -1]
    assert fuel_to_int([55.25, 100.0], "cpct").tolist() == [5525, 10000]
    litres = fuel_to_litres(np.array([5525, -1]), "cpct", 200.0)
    assert litres[0] == pytest.approx(110.5) and np.isnan(litres[1])
    assert fuel_to_litres(np.array([1824]), "dl", 999.0)[0] == pytest.approx(182.4)


def test_degrees():
    ints = deg_to_int([13.7957633, float("nan")])
    assert ints.tolist() == [1379576, 0]
    assert int_to_deg(ints)[0] == pytest.approx(13.79576)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_codec.py -q`
Expected: `ModuleNotFoundError: No module named 'series_codec'`.

- [ ] **Step 3: Implement `scripts/fuel/series_codec.py`**

```python
"""Packed binary columns for analytics.gps_series (spec §3.1, enc version 1).

Each column is little-endian bytes holding n values (one per minute bucket).
fuel / fuel_lo / fuel_hi are integers in the document's fuel_unit:
  "dl"   deci-litres   (Terminus — the sensor reports litres)
  "cpct" centi-percent (Besttech — the sensor reports % of tank)
-1 means no valid fuel reading in that minute. lat/lng are degrees × 1e5; 0 means no position.
Mirrored by fuel-control-center src/lib/series-codec.ts — change both together.
"""
import numpy as np

ENC_VERSION = 1
FUEL_MISSING = -1
COLUMNS = {
    "m": "<u2",
    "fuel": "<i2",
    "fuel_lo": "<i2",
    "fuel_hi": "<i2",
    "speed": "u1",
    "engine": "u1",
    "lat": "<i4",
    "lng": "<i4",
}
_FUEL_SCALE = {"dl": 10.0, "cpct": 100.0}
_DEG_SCALE = 1e5


def encode_columns(cols: dict[str, np.ndarray]) -> dict[str, bytes]:
    n = None
    out = {}
    for name, dtype in COLUMNS.items():
        if name not in cols:
            raise ValueError(f"missing column {name}")
        values = np.asarray(cols[name])
        if n is None:
            n = len(values)
        elif len(values) != n:
            raise ValueError(f"column {name} has {len(values)} values, expected {n}")
        out[name] = values.astype(dtype).tobytes()
    return out


def decode_column(raw: bytes, name: str, n: int) -> np.ndarray:
    return np.frombuffer(bytes(raw), dtype=COLUMNS[name], count=n)


def decode_columns(raw: dict[str, bytes], n: int) -> dict[str, np.ndarray]:
    return {name: decode_column(raw[name], name, n) for name in COLUMNS}


def fuel_to_int(values, unit: str) -> np.ndarray:
    scale = _FUEL_SCALE[unit]
    arr = np.asarray(values, dtype="float64")
    out = np.full(arr.shape, FUEL_MISSING, dtype="int16")
    ok = np.isfinite(arr) & (arr >= 0)
    out[ok] = np.clip(np.rint(arr[ok] * scale), 0, 32767).astype("int16")
    return out


def fuel_to_litres(values, unit: str, tank_l: float) -> np.ndarray:
    raw = np.asarray(values, dtype="float64")
    litres = raw / _FUEL_SCALE[unit]
    if unit == "cpct":
        litres = litres * tank_l / 100.0
    litres[raw < 0] = np.nan
    return litres


def deg_to_int(values) -> np.ndarray:
    arr = np.asarray(values, dtype="float64")
    out = np.zeros(arr.shape, dtype="int32")
    ok = np.isfinite(arr)
    out[ok] = np.rint(arr[ok] * _DEG_SCALE).astype("int32")
    return out


def int_to_deg(values) -> np.ndarray:
    return np.asarray(values, dtype="float64") / _DEG_SCALE
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_codec.py -q`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/series_codec.py scripts/fuel/tests/test_series_codec.py
git commit -m "feat(fuel): packed binary column codec for gps_series

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Series builder (minute buckets, coverage, document)

**Files:**
- Create: `scripts/fuel/series_build.py`
- Test: `scripts/fuel/tests/test_series_build.py`

**Interfaces:**
- Consumes: Task 2 `encode_columns`, `fuel_to_int`, `deg_to_int`, `int_to_deg`, `ENC_VERSION`.
- Produces: `Reading(sec: int, fuel: float | None, speed: float, engine: int, lat: float | None, lng: float | None)` (frozen dataclass; `sec` = seconds since 00:00 Thai time; `fuel` in the source unit), `to_number(value) -> float | None`, `bucket_readings(readings, unit) -> dict[str, np.ndarray]`, `path_km(lat_int, lng_int) -> float`, `coverage(cols, points, offline=False) -> dict`, `thai_midnight_utc(day) -> datetime`, `series_id(plate, day, source) -> str`, `build_series_doc(*, plate, truck_code, day, source, unit, tank_l, tank_from, readings, offline=False, now=None) -> dict`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_series_build.py`:
```python
from datetime import date, datetime

import numpy as np
import pytest

from series_build import Reading, build_series_doc, bucket_readings, coverage, path_km, to_number
from series_codec import decode_columns


def R(sec, fuel=None, speed=0.0, engine=1, lat=13.70, lng=100.50):
    return Reading(sec=sec, fuel=fuel, speed=speed, engine=engine, lat=lat, lng=lng)


def test_to_number():
    assert to_number("1.5") == 1.5 and to_number(None) is None
    assert to_number("x") is None and to_number(float("nan")) is None


def test_bucket_median_min_max_per_minute():
    cols = bucket_readings([R(36000, 50.0), R(36020, 52.0), R(36040, None), R(36065, None)], "cpct")
    assert cols["m"].tolist() == [600, 601]
    assert cols["fuel"].tolist() == [5100, -1]
    assert cols["fuel_lo"].tolist() == [5000, -1]
    assert cols["fuel_hi"].tolist() == [5200, -1]


def test_bucket_speed_engine_and_last_position():
    cols = bucket_readings([
        R(100, 10.0, speed=0, engine=0, lat=13.0, lng=100.0),
        R(110, 10.0, speed=42.4, engine=1, lat=13.5, lng=100.5),
    ], "dl")
    assert cols["speed"].tolist() == [42]
    assert cols["engine"].tolist() == [1]
    assert cols["lat"].tolist() == [1350000]
    assert cols["fuel"].tolist() == [100]


def test_bucket_unsorted_input_uses_latest_position():
    cols = bucket_readings([R(110, lat=13.5, lng=100.5), R(100, lat=13.0, lng=100.0)], "dl")
    assert cols["lat"].tolist() == [1350000]


def test_bucket_duplicate_timestamps_are_kept():
    cols = bucket_readings([R(60, 100.0), R(60, 102.0)], "dl")
    assert cols["fuel"].tolist() == [1010]


def test_path_km_skips_missing_and_jumps():
    lat = np.array([1370000, 1371000, 0, 1372000, 1472000])  # 0.01° steps ≈ 1.11 km, then a 111 km jump
    lng = np.array([10050000, 10050000, 0, 10050000, 10050000])
    assert path_km(lat, lng) == pytest.approx(2.22, abs=0.02)


def moving_hour(fuel_at):
    # 60 minutes driving north 0.01° per minute ≈ 66 km, engine on
    return [R(i * 60, fuel_at(i), speed=60, engine=1, lat=13.0 + 0.01 * i, lng=100.5) for i in range(60)]


def test_coverage_status_rules():
    empty = bucket_readings([], "dl")
    assert coverage(empty, 0)["status"] == "no_data"
    assert coverage(empty, 0, offline=True)["status"] == "offline"
    assert coverage(bucket_readings([R(60, None), R(120, None)], "dl"), 2)["status"] == "no_sensor"
    assert coverage(bucket_readings(moving_hour(lambda i: 80.0), "dl"), 60)["status"] == "stuck"
    assert coverage(bucket_readings(moving_hour(lambda i: 80.0 - i * 0.1), "dl"), 60)["status"] == "ok"
    parked_flat = [R(i * 60, 80.0, speed=0, engine=1) for i in range(60)]
    assert coverage(bucket_readings(parked_flat, "dl"), 60)["status"] == "ok"


def test_coverage_numbers():
    cov = coverage(bucket_readings([R(600 * 60, 50.0), R(700 * 60, None)], "dl"), 2)
    assert cov["minutes"] == 2 and cov["points"] == 2
    assert cov["fuel_valid_share"] == 0.5
    assert cov["first"] == "10:00" and cov["last"] == "11:40"
    assert cov["max_gap_min"] == 1439 - 700


def test_build_series_doc_shape():
    now = datetime(2026, 10, 6, 1, 0)
    doc = build_series_doc(plate="สบ.71-8635", truck_code="ME152", day=date(2026, 10, 5), source="besttech",
                           unit="cpct", tank_l=200, tank_from="default",
                           readings=[R(60, 55.0), R(120, 54.5)], now=now)
    assert doc["_id"] == "สบ.71-8635|2026-10-05|besttech"
    assert doc["date"] == datetime(2026, 10, 4, 17, 0)
    assert doc["n"] == 2 and doc["enc"] == 1 and doc["fuel_unit"] == "cpct"
    assert decode_columns(doc["cols"], 2)["fuel"].tolist() == [5500, 5450]
    assert doc["ingested_at"] == now


def test_build_series_doc_without_readings_has_no_cols():
    doc = build_series_doc(plate="สบ.71-8623", truck_code="ME162", day=date(2026, 10, 5), source="besttech",
                           unit="cpct", tank_l=200, tank_from="default", readings=[], offline=True)
    assert doc["n"] == 0 and "cols" not in doc
    assert doc["coverage"]["status"] == "offline"


def test_same_inputs_give_same_id():
    kwargs = dict(plate="สบ.71-8635", truck_code=None, day=date(2026, 10, 5), source="terminus",
                  unit="dl", tank_l=200, tank_from="default", readings=[R(60, 1.0)])
    assert build_series_doc(**kwargs)["_id"] == build_series_doc(**kwargs)["_id"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_build.py -q`
Expected: `ModuleNotFoundError: No module named 'series_build'`.

- [ ] **Step 3: Implement `scripts/fuel/series_build.py`**

```python
"""Turn one truck-day of GPS readings into an analytics.gps_series document (spec §3.1–3.2)."""
import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

import numpy as np

from series_codec import ENC_VERSION, deg_to_int, encode_columns, fuel_to_int, int_to_deg

TH_TZ = timezone(timedelta(hours=7))
STUCK_MIN_KM = 50.0       # a stuck sensor is only judged on a day the truck really drove
MAX_JUMP_KM = 5.0         # larger steps between consecutive minutes are GPS glitches
EARTH_RADIUS_KM = 6371.0


@dataclass(frozen=True)
class Reading:
    sec: int              # seconds since 00:00 Thai time (0–86399)
    fuel: float | None    # in the source unit (litres or %); None when invalid
    speed: float          # km/h
    engine: int           # 1 = engine on
    lat: float | None
    lng: float | None


def to_number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def bucket_readings(readings: list[Reading], unit: str) -> dict[str, np.ndarray]:
    """Group readings per minute → integer columns ready for encode_columns()."""
    by_minute: dict[int, list[Reading]] = {}
    for reading in sorted(readings, key=lambda r: r.sec):
        minute = reading.sec // 60
        if 0 <= minute < 1440:
            by_minute.setdefault(minute, []).append(reading)
    minutes = sorted(by_minute)
    n = len(minutes)
    fuel, lo, hi = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    speed = np.zeros(n)
    engine = np.zeros(n, dtype="uint8")
    lat, lng = np.full(n, np.nan), np.full(n, np.nan)
    for i, minute in enumerate(minutes):
        group = by_minute[minute]
        values = [r.fuel for r in group if r.fuel is not None and math.isfinite(r.fuel) and r.fuel >= 0]
        if values:
            fuel[i], lo[i], hi[i] = float(np.median(values)), min(values), max(values)
        speed[i] = max((r.speed or 0.0) for r in group)
        engine[i] = 1 if any(r.engine for r in group) else 0
        positioned = [r for r in group if r.lat is not None and r.lng is not None]
        if positioned:
            lat[i], lng[i] = positioned[-1].lat, positioned[-1].lng
    return {
        "m": np.array(minutes, dtype="uint16"),
        "fuel": fuel_to_int(fuel, unit),
        "fuel_lo": fuel_to_int(lo, unit),
        "fuel_hi": fuel_to_int(hi, unit),
        "speed": np.clip(np.rint(speed), 0, 255).astype("uint8"),
        "engine": engine,
        "lat": deg_to_int(lat),
        "lng": deg_to_int(lng),
    }


def path_km(lat_int, lng_int) -> float:
    """Distance over consecutive positions (haversine), ignoring missing points and jumps > 5 km."""
    lat_int, lng_int = np.asarray(lat_int), np.asarray(lng_int)
    ok = (lat_int != 0) & (lng_int != 0)
    lat = np.radians(int_to_deg(lat_int[ok]))
    lng = np.radians(int_to_deg(lng_int[ok]))
    if len(lat) < 2:
        return 0.0
    a = np.sin(np.diff(lat) / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(np.diff(lng) / 2) ** 2
    steps = 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    return float(steps[steps <= MAX_JUMP_KM].sum())


def _hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def coverage(cols: dict[str, np.ndarray], points: int, offline: bool = False) -> dict:
    n = len(cols["m"])
    if n == 0:
        return {"points": 0, "minutes": 0, "fuel_valid_share": 0.0, "max_gap_min": 1440,
                "first": None, "last": None, "moved_km": 0.0,
                "status": "offline" if offline else "no_data"}
    minutes = cols["m"].astype(int)
    valid = cols["fuel"] >= 0
    moved = round(path_km(cols["lat"], cols["lng"]), 1)
    if not valid.any():
        status = "no_sensor"
    else:
        on = valid & (cols["engine"] == 1)
        flat = bool(on.any()) and np.unique(cols["fuel"][on]).size == 1
        status = "stuck" if flat and moved >= STUCK_MIN_KM else "ok"
    return {
        "points": int(points),
        "minutes": int(n),
        "fuel_valid_share": round(float(valid.mean()), 3),
        "max_gap_min": int(np.diff(np.concatenate(([0], minutes, [1439]))).max()),
        "first": _hhmm(int(minutes[0])),
        "last": _hhmm(int(minutes[-1])),
        "moved_km": moved,
        "status": status,
    }


def thai_midnight_utc(day: date) -> datetime:
    """00:00 Thai time as a naive UTC datetime (pymongo stores naive datetimes as UTC)."""
    return datetime.combine(day, time(0, 0), tzinfo=TH_TZ).astimezone(timezone.utc).replace(tzinfo=None)


def series_id(plate: str, day: date, source: str) -> str:
    return f"{plate}|{day.isoformat()}|{source}"


def build_series_doc(*, plate: str, truck_code: str | None, day: date, source: str, unit: str,
                     tank_l: float, tank_from: str, readings: list[Reading],
                     offline: bool = False, now: datetime | None = None) -> dict:
    cols = bucket_readings(readings, unit)
    n = int(len(cols["m"]))
    doc = {
        "_id": series_id(plate, day, source),
        "plate": plate,
        "truck_code": truck_code,
        "date_key": day.isoformat(),
        "date": thai_midnight_utc(day),
        "source": source,
        "fuel_unit": unit,
        "tank_l": float(tank_l),
        "tank_from": tank_from,
        "enc": ENC_VERSION,
        "n": n,
        "coverage": coverage(cols, points=len(readings), offline=offline),
        "ingested_at": now or datetime.now(timezone.utc).replace(tzinfo=None),
    }
    if n:
        doc["cols"] = encode_columns(cols)
    return doc
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_build.py -q`
Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/series_build.py scripts/fuel/tests/test_series_build.py
git commit -m "feat(fuel): minute bucketing, coverage status and gps_series document builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mongo store helpers

**Files:**
- Create: `scripts/fuel/series_store.py`
- Test: `scripts/fuel/tests/test_series_store.py`

**Interfaces:**
- Produces: `SERIES = "gps_series"`, `TANKS = "fuel_tanks"`, `TTL_DAYS = 400`, `DEFAULT_TANK_L = 200.0`, `ensure_indexes(db) -> None`, `upsert_series(db, docs) -> int`, `load_tanks(db) -> dict[str, dict]`, `tank_for(tanks, plate) -> tuple[float, str]`, `count_series(db, date_key, source) -> int`, `recent_plates(db, source, date_key, lookback_days=7) -> set[str]`. `db` is a pymongo `Database` (`client["analytics"]`).

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_series_store.py`:
```python
from pymongo import ReplaceOne

from series_store import (DEFAULT_TANK_L, SERIES, TTL_DAYS, ensure_indexes, recent_plates, tank_for,
                          upsert_series)


class FakeCollection:
    def __init__(self):
        self.indexes, self.writes, self.distinct_calls = [], [], []

    def create_index(self, keys, **kwargs):
        self.indexes.append((keys, kwargs))

    def bulk_write(self, ops, ordered=True):
        self.writes.append((ops, ordered))

    def distinct(self, field, query):
        self.distinct_calls.append((field, query))
        return ["สบ.71-0001", "สบ.71-0001", "สบ.71-0002"]


class FakeDB(dict):
    def __getitem__(self, name):
        return self.setdefault(name, FakeCollection())


def test_ensure_indexes_sets_ttl_on_date():
    db = FakeDB()
    ensure_indexes(db)
    ttl = [kwargs for keys, kwargs in db[SERIES].indexes if keys == [("date", 1)]]
    assert ttl == [{"name": "ttl_date", "expireAfterSeconds": TTL_DAYS * 86400}]


def test_upsert_series_replaces_by_id():
    db = FakeDB()
    assert upsert_series(db, [{"_id": "a"}, {"_id": "b"}]) == 2
    ops, ordered = db[SERIES].writes[0]
    assert ordered is False and len(ops) == 2 and all(isinstance(op, ReplaceOne) for op in ops)


def test_upsert_series_empty_is_noop():
    db = FakeDB()
    assert upsert_series(db, []) == 0 and db[SERIES].writes == []


def test_tank_for_defaults_and_known():
    assert tank_for({}, "x") == (DEFAULT_TANK_L, "default")
    assert tank_for({"x": {"tank_l": 180, "tank_from": "calibrated"}}, "x") == (180.0, "calibrated")


def test_recent_plates_queries_previous_days_only():
    db = FakeDB()
    assert recent_plates(db, "terminus", "2026-10-05", lookback_days=2) == {"สบ.71-0001", "สบ.71-0002"}
    _, query = db[SERIES].distinct_calls[0]
    assert query == {"source": "terminus", "date_key": {"$in": ["2026-10-04", "2026-10-03"]}, "n": {"$gt": 0}}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_store.py -q`
Expected: `ModuleNotFoundError: No module named 'series_store'`.

- [ ] **Step 3: Implement `scripts/fuel/series_store.py`**

```python
"""Mongo access for analytics.gps_series and analytics.fuel_tanks (spec §3.1, §3.4)."""
from datetime import date, timedelta

from pymongo import ASCENDING, DESCENDING, ReplaceOne

SERIES = "gps_series"
TANKS = "fuel_tanks"
TTL_DAYS = 400
DEFAULT_TANK_L = 200.0


def ensure_indexes(db) -> None:
    col = db[SERIES]
    col.create_index([("date_key", ASCENDING), ("source", ASCENDING)], name="date_source")
    col.create_index([("plate", ASCENDING), ("date_key", DESCENDING)], name="plate_date")
    col.create_index([("date", ASCENDING)], name="ttl_date", expireAfterSeconds=TTL_DAYS * 86400)


def upsert_series(db, docs: list[dict]) -> int:
    if not docs:
        return 0
    db[SERIES].bulk_write([ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs], ordered=False)
    return len(docs)


def load_tanks(db) -> dict[str, dict]:
    return {d["_id"]: d for d in db[TANKS].find({}, {"tank_l": 1, "tank_from": 1})}


def tank_for(tanks: dict[str, dict], plate: str) -> tuple[float, str]:
    tank = tanks.get(plate) or {}
    if tank.get("tank_l"):
        return float(tank["tank_l"]), tank.get("tank_from", "default")
    return DEFAULT_TANK_L, "default"


def count_series(db, date_key: str, source: str) -> int:
    return db[SERIES].count_documents({"date_key": date_key, "source": source})


def recent_plates(db, source: str, date_key: str, lookback_days: int = 7) -> set[str]:
    """Plates that had readings for `source` in the `lookback_days` before `date_key`."""
    day = date.fromisoformat(date_key)
    keys = [(day - timedelta(days=i)).isoformat() for i in range(1, lookback_days + 1)]
    return set(db[SERIES].distinct("plate", {"source": source, "date_key": {"$in": keys}, "n": {"$gt": 0}}))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_store.py -q`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/series_store.py scripts/fuel/tests/test_series_store.py
git commit -m "feat(fuel): gps_series store helpers (indexes, TTL, upsert, tanks)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Besttech API client

**Files:**
- Create: `scripts/fuel/besttech_client.py`
- Test: `scripts/fuel/tests/test_besttech_client.py`

**Interfaces:**
- Produces: `DEFAULT_BASE_URL`, `THROTTLE_WAITS = (15, 30, 45, 60, 60, 60)`, `class BesttechError(RuntimeError)`, `class BesttechClient(api_key, base_url=DEFAULT_BASE_URL, spacing_s=35.0, pause_hours=(9, 10), timeout_s=180, session=None, sleep=time.sleep, monotonic=time.monotonic, now=None)` with `track() -> list[dict]` (the `/track` `info.vehicles`) and `history_all(start: datetime, end: datetime) -> list[dict]` (the `/history_all` `info.vehicles`, each `{vehicle_no, count, points}`).

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_besttech_client.py`:
```python
from datetime import datetime, timedelta, timezone

import pytest
import requests

from besttech_client import THROTTLE_WAITS, BesttechClient, BesttechError

TH = timezone(timedelta(hours=7))


class FakeResp:
    def __init__(self, payload, status=200):
        self.payload, self.status_code = payload, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class Clock:
    def __init__(self):
        self.t, self.sleeps = 1000.0, []

    def monotonic(self):
        return self.t

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.t += seconds


OK_TRACK = FakeResp({"what": "ok", "info": {"vehicles": [{"vehicle_no": "ME152 (71-8635 สบ.)"}]}})
THROTTLED = FakeResp({"what": "error", "error_code": "error.TooManyRequests", "msg": "busy"})


def make(responses, hour=12, spacing=35.0):
    clock = Clock()
    session = FakeSession(responses)
    client = BesttechClient("KEY", spacing_s=spacing, session=session, sleep=clock.sleep,
                            monotonic=clock.monotonic, now=lambda: datetime(2026, 10, 6, hour, 30, tzinfo=TH))
    return client, session, clock


def test_track_sends_bearer_and_returns_vehicles():
    client, session, _ = make([OK_TRACK])
    assert client.track() == [{"vehicle_no": "ME152 (71-8635 สบ.)"}]
    call = session.calls[0]
    assert call["url"].endswith("/apiservices/track")
    assert call["headers"] == {"Authorization": "Bearer KEY"}
    assert call["json"] == {"last_gps_time": ""}


def test_calls_are_spaced():
    client, _, clock = make([OK_TRACK, OK_TRACK])
    client.track()
    client.track()
    assert clock.sleeps == [35.0]


def test_throttle_then_success():
    client, _, clock = make([THROTTLED, OK_TRACK])
    assert len(client.track()) == 1
    assert clock.sleeps[0] == THROTTLE_WAITS[0]


def test_persistent_throttle_raises():
    client, _, _ = make([THROTTLED] * (len(THROTTLE_WAITS) + 1), spacing=0)
    with pytest.raises(BesttechError, match="TooManyRequests"):
        client.track()


def test_other_error_raises_immediately():
    bad = FakeResp({"what": "error", "error_code": "error.APIKeyNotFound", "msg": "nope"})
    client, session, _ = make([bad])
    with pytest.raises(BesttechError, match="APIKeyNotFound"):
        client.track()
    assert len(session.calls) == 1


def test_network_error_is_retried():
    client, _, clock = make([requests.ConnectionError("down"), OK_TRACK], spacing=0)
    assert len(client.track()) == 1
    assert 2 in clock.sleeps


def test_http_error_status_is_retried():
    client, _, _ = make([FakeResp({}, status=502), OK_TRACK], spacing=0)
    assert len(client.track()) == 1


def test_pause_window_waits_until_it_ends():
    client, _, clock = make([OK_TRACK], hour=9)
    client.track()
    assert clock.sleeps[0] == 30 * 60


def test_history_all_body():
    resp = FakeResp({"what": "ok", "info": {"count_vehicles": 1, "vehicles": [{"vehicle_no": "x", "points": []}]}})
    client, session, _ = make([resp])
    out = client.history_all(datetime(2026, 10, 5, 10, 0, 0), datetime(2026, 10, 5, 10, 59, 59))
    assert out == [{"vehicle_no": "x", "points": []}]
    assert session.calls[0]["json"] == {"start_time": "2026-10-05 10:00:00", "end_time": "2026-10-05 10:59:59"}


def test_missing_key_raises():
    with pytest.raises(BesttechError):
        BesttechClient("")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_besttech_client.py -q`
Expected: `ModuleNotFoundError: No module named 'besttech_client'`.

- [ ] **Step 3: Implement `scripts/fuel/besttech_client.py`**

```python
"""BestTransport API client — /track and /history_all (spec §3.3).

Quirks confirmed in production (menatransport/mongodb-gps app/services/besttech.py):
- Auth is `Authorization: Bearer <key>`.
- Content-Type must be plain application/json (a "; charset=utf-8" suffix returns HTTP 415), so the
  body goes through requests' json= and no Content-Type header is set by hand.
- Calling too often returns HTTP 200 with error_code "error.TooManyRequests"; the server needs about
  30–45 s before it accepts the next call.
- mongodb-gps ingests concrete data at 09:25 BKK with the same key, so calls pause 09:00–10:00.
"""
import time
from datetime import datetime, timedelta, timezone

import requests

DEFAULT_BASE_URL = "https://besttransportservice.bestgeosystem.com/apiservices"
THROTTLE_WAITS = (15, 30, 45, 60, 60, 60)
NETWORK_RETRIES = 3
TH_TZ = timezone(timedelta(hours=7))
TIME_FMT = "%Y-%m-%d %H:%M:%S"


class BesttechError(RuntimeError):
    """The Besttech service failed or answered with an error envelope."""


class BesttechClient:
    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL, spacing_s: float = 35.0,
                 pause_hours: tuple[int, int] | None = (9, 10), timeout_s: int = 180, session=None,
                 sleep=time.sleep, monotonic=time.monotonic, now=None):
        if not api_key:
            raise BesttechError("BESTTECH_API is not set")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.spacing_s = spacing_s
        self.pause_hours = pause_hours
        self.timeout_s = timeout_s
        self.session = session or requests.Session()
        self.sleep = sleep
        self.monotonic = monotonic
        self.now = now or (lambda: datetime.now(TH_TZ))
        self._last_call: float | None = None

    def _wait_turn(self) -> None:
        if self.pause_hours:
            start_hour, end_hour = self.pause_hours
            now = self.now()
            if start_hour <= now.hour < end_hour:
                resume = now.replace(hour=end_hour, minute=0, second=0, microsecond=0)
                self.sleep((resume - now).total_seconds())
        if self._last_call is not None:
            wait = self.spacing_s - (self.monotonic() - self._last_call)
            if wait > 0:
                self.sleep(wait)

    def _post(self, path: str, body: dict) -> dict:
        throttled = 0
        failures = 0
        while True:
            self._wait_turn()
            try:
                response = self.session.post(f"{self.base_url}/{path}", json=body,
                                             headers={"Authorization": f"Bearer {self.api_key}"},
                                             timeout=self.timeout_s)
                self._last_call = self.monotonic()
                response.raise_for_status()
                payload = response.json()
            except (requests.RequestException, ValueError) as exc:
                self._last_call = self.monotonic()
                failures += 1
                if failures >= NETWORK_RETRIES:
                    raise BesttechError(f"{path} failed after {failures} attempts: {exc}") from exc
                self.sleep(2 ** failures)
                continue
            if payload.get("what") != "error":
                return payload
            code = payload.get("error_code")
            if code == "error.TooManyRequests" and throttled < len(THROTTLE_WAITS):
                self.sleep(THROTTLE_WAITS[throttled])
                throttled += 1
                continue
            raise BesttechError(f"{path} returned {code}: {payload.get('msg')}")

    def track(self) -> list[dict]:
        payload = self._post("track", {"last_gps_time": ""})
        return (payload.get("info") or {}).get("vehicles") or []

    def history_all(self, start: datetime, end: datetime) -> list[dict]:
        body = {"start_time": start.strftime(TIME_FMT), "end_time": end.strftime(TIME_FMT)}
        payload = self._post("history_all", body)
        return (payload.get("info") or {}).get("vehicles") or []
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_besttech_client.py -q`
Expected: `10 passed`.

- [ ] **Step 5: ⚠️ PROD (Besttech, 4 calls) — measure the safe spacing**

Ask the user first. Then run:
```bash
.venv/bin/python - <<'EOF'
import os, sys, time
sys.path.insert(0, "scripts/fuel")
from dotenv import load_dotenv
load_dotenv("scripts/.env")
from besttech_client import BesttechClient
c = BesttechClient(os.environ["BESTTECH_API"], spacing_s=10, pause_hours=None, sleep=lambda s: (print(f"  sleep {s:.0f}s"), time.sleep(s)))
for i in range(4):
    t = time.time(); n = len(c.track()); print(f"call {i+1}: {n} vehicles in {time.time()-t:.1f}s")
EOF
```
Expected: 4 lines `call N: 137 vehicles`. If any `sleep 15s` line appears (a throttle), the safe spacing is above 10 s: keep the default 35 s. If none appears, record `BESTTECH_SPACING_S=10` as safe for the backfill (Task 10); the nightly job keeps 35 s.

- [ ] **Step 6: Commit**

```bash
git add scripts/fuel/besttech_client.py scripts/fuel/tests/test_besttech_client.py
git commit -m "feat(fuel): Besttech /track + /history_all client with spacing, throttle back-off, quiet hour

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Besttech series job (`fuel_series_besttech`)

**Files:**
- Create: `scripts/fuel/series_besttech.py`
- Modify: `routes/pipeline/pipeline_routes.py` (`PIPELINE_SCRIPTS`, `PIPELINE_NAMES`, `RUN_LOG_LOCATION`)
- Test: `scripts/fuel/tests/test_series_besttech.py`

**Interfaces:**
- Consumes: Task 1 `split_besttech_vehicle`, `parse_days`; Task 3 `Reading`, `build_series_doc`, `to_number`; Task 4 `ensure_indexes`, `upsert_series`, `load_tanks`, `tank_for`, `count_series`; Task 5 `BesttechClient`, `DEFAULT_BASE_URL`; `scripts/engineon/common.py` `MONGODB_URI`, `JobLog`, `log`, `yesterday_bkk`.
- Produces: `besttech_day_docs(day, track_vehicles, windows, tanks, now=None) -> list[dict]`, `fetch_day(client, day) -> list[list[dict]]`, `run_days(client, db, days, force=False) -> int`, `make_client() -> BesttechClient`, `SOURCE = "besttech"`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_series_besttech.py`:
```python
from datetime import date

from series_besttech import besttech_day_docs
from series_codec import decode_columns

DAY = date(2026, 10, 5)
TRACK = [
    {"vehicle_no": "ME152 (71-8635 สบ.)", "state": "ON_RUN", "gps_time": "2026-10-06 11:18:55"},
    {"vehicle_no": "ME162 (71-8623 สบ.)", "state": "OFFLINE", "gps_time": "2026-06-11 15:06:33"},
    {"vehicle_no": "70-6294 สบ.", "state": "OFF", "gps_time": "2026-10-06 08:00:00"},
]


def pt(t, fuel=55.0, engine="ON", speed=0):
    return {"gps_time": t, "fuel_percentage": fuel, "engine": engine, "speed": speed, "lat": 14.28, "lng": 100.78}


def by_plate(docs):
    return {d["plate"]: d for d in docs}


def test_points_become_one_doc_per_plate():
    windows = [[{"vehicle_no": "ME152 (71-8635 สบ.)", "points": [
        pt("2026-10-05 00:00:16", 55.0), pt("2026-10-05 00:00:46", 54.0), pt("2026-10-05 10:15:00", -1),
    ]}]]
    d = by_plate(besttech_day_docs(DAY, TRACK, windows, {}))["สบ.71-8635"]
    assert d["truck_code"] == "ME152" and d["fuel_unit"] == "cpct" and d["n"] == 2
    cols = decode_columns(d["cols"], d["n"])
    assert cols["m"].tolist() == [0, 615]
    assert cols["fuel"].tolist() == [5450, -1]


def test_silent_vehicles_get_offline_or_no_data_docs():
    docs = by_plate(besttech_day_docs(DAY, TRACK, [[]], {}))
    assert docs["สบ.71-8623"]["coverage"]["status"] == "offline"
    assert docs["สบ.70-6294"]["coverage"]["status"] == "no_data"
    assert docs["สบ.71-8635"]["coverage"]["status"] == "no_data"


def test_points_outside_the_day_are_dropped():
    windows = [[{"vehicle_no": "ME152 (71-8635 สบ.)",
                 "points": [pt("2026-10-04 23:59:59"), pt("2026-10-06 00:00:01")]}]]
    assert by_plate(besttech_day_docs(DAY, TRACK, windows, {}))["สบ.71-8635"]["n"] == 0


def test_box_swap_two_codes_one_plate_merges():
    windows = [[
        {"vehicle_no": "ME152 (71-8635 สบ.)", "points": [pt("2026-10-05 08:00:00", 60.0)]},
        {"vehicle_no": "ME999 (71-8635 สบ.)", "points": [pt("2026-10-05 09:00:00", 59.0)]},
    ]]
    docs = [d for d in besttech_day_docs(DAY, [], windows, {}) if d["plate"] == "สบ.71-8635"]
    assert len(docs) == 1 and docs[0]["n"] == 2 and docs[0]["truck_code"] == "ME152"


def test_empty_hours_still_build_the_day():
    windows = [[] for _ in range(23)] + [[{"vehicle_no": "70-6294 สบ.", "points": [pt("2026-10-05 23:10:00")]}]]
    d = by_plate(besttech_day_docs(DAY, TRACK, windows, {}))["สบ.70-6294"]
    assert d["n"] == 1 and d["coverage"]["max_gap_min"] == 23 * 60 + 10


def test_tank_size_comes_from_tanks():
    windows = [[{"vehicle_no": "ME152 (71-8635 สบ.)", "points": [pt("2026-10-05 08:00:00")]}]]
    tanks = {"สบ.71-8635": {"tank_l": 180.0, "tank_from": "calibrated"}}
    d = by_plate(besttech_day_docs(DAY, TRACK, windows, tanks))["สบ.71-8635"]
    assert (d["tank_l"], d["tank_from"]) == (180.0, "calibrated")


def test_string_numbers_are_accepted():
    windows = [[{"vehicle_no": "ME152 (71-8635 สบ.)", "points": [
        {"gps_time": "2026-10-05 08:00:00", "fuel_percentage": "92.8", "engine": "ON", "speed": "12",
         "lat": "13.7957633", "lng": "100.5571733"}]}]]
    d = by_plate(besttech_day_docs(DAY, [], windows, {}))["สบ.71-8635"]
    cols = decode_columns(d["cols"], d["n"])
    assert cols["fuel"].tolist() == [9280] and cols["speed"].tolist() == [12] and cols["lat"].tolist() == [1379576]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_besttech.py -q`
Expected: `ModuleNotFoundError: No module named 'series_besttech'`.

- [ ] **Step 3: Implement `scripts/fuel/series_besttech.py`**

```python
"""fuel_series_besttech — Besttech /history_all → analytics.gps_series (spec §3.3, §3.5).

Default day = yesterday (Bangkok). START_DATE / END_DATE (dd/mm/YYYY) select a range.
A day that already has docs for ≥ 90 % of the /track vehicle list is skipped unless FORCE=1,
so a long backfill can be stopped and restarted. BESTTECH_SPACING_S overrides the 35 s gap.
Local runs read scripts/.env (MONGODB_URI, BESTTECH_API).
"""
import os
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log, yesterday_bkk  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from besttech_client import DEFAULT_BASE_URL, BesttechClient  # noqa: E402
from dates import parse_days  # noqa: E402
from plates import split_besttech_vehicle  # noqa: E402
from series_build import Reading, build_series_doc, to_number  # noqa: E402
from series_store import count_series, ensure_indexes, load_tanks, tank_for, upsert_series  # noqa: E402

SOURCE = "besttech"
UNIT = "cpct"
COMPLETE_SHARE = 0.9
TIME_FMT = "%Y-%m-%d %H:%M:%S"


def _parse_time(value) -> datetime | None:
    try:
        return datetime.strptime(str(value or ""), TIME_FMT)
    except ValueError:
        return None


def _reading(point: dict, sec: int) -> Reading:
    fuel = to_number(point.get("fuel_percentage"))
    return Reading(
        sec=sec,
        fuel=fuel if fuel is not None and fuel >= 0 else None,   # -1 = sensor not configured
        speed=to_number(point.get("speed")) or 0.0,
        engine=1 if str(point.get("engine", "")).upper() == "ON" else 0,
        lat=to_number(point.get("lat")),
        lng=to_number(point.get("lng")),
    )


def besttech_day_docs(day: date, track_vehicles: list[dict], windows: list[list[dict]],
                      tanks: dict, now: datetime | None = None) -> list[dict]:
    """One doc per plate for `day`, from the /track list and the day's /history_all windows."""
    readings: dict[str, list[Reading]] = {}
    codes: dict[str, str] = {}
    for vehicles in windows:
        for vehicle in vehicles:
            code, plate = split_besttech_vehicle(vehicle.get("vehicle_no"))
            if not plate:
                continue
            if code and plate not in codes:
                codes[plate] = code   # a box swap reports a second code for the same plate
            for point in vehicle.get("points") or []:
                ts = _parse_time(point.get("gps_time"))
                if ts is None or ts.date() != day:
                    continue
                sec = ts.hour * 3600 + ts.minute * 60 + ts.second
                readings.setdefault(plate, []).append(_reading(point, sec))

    docs = []
    for plate, plate_readings in readings.items():
        tank_l, tank_from = tank_for(tanks, plate)
        docs.append(build_series_doc(plate=plate, truck_code=codes.get(plate), day=day, source=SOURCE,
                                     unit=UNIT, tank_l=tank_l, tank_from=tank_from,
                                     readings=plate_readings, now=now))

    day_start = datetime.combine(day, time.min)
    for vehicle in track_vehicles:
        code, plate = split_besttech_vehicle(vehicle.get("vehicle_no"))
        if not plate or plate in readings:
            continue
        last = _parse_time(vehicle.get("gps_time"))
        tank_l, tank_from = tank_for(tanks, plate)
        docs.append(build_series_doc(plate=plate, truck_code=code, day=day, source=SOURCE, unit=UNIT,
                                     tank_l=tank_l, tank_from=tank_from, readings=[],
                                     offline=last is None or last < day_start, now=now))
    return docs


def fetch_day(client: BesttechClient, day: date) -> list[list[dict]]:
    windows = []
    for hour in range(24):
        start = datetime.combine(day, time(hour, 0, 0))
        windows.append(client.history_all(start, start + timedelta(minutes=59, seconds=59)))
    return windows


def run_days(client: BesttechClient, db, days: list[date], force: bool = False) -> int:
    ensure_indexes(db)
    track = client.track()
    tanks = load_tanks(db)
    written = 0
    for day in days:
        key = day.isoformat()
        if not force and track and count_series(db, key, SOURCE) >= COMPLETE_SHARE * len(track):
            log.info("besttech %s already complete — skipped", key)
            continue
        docs = besttech_day_docs(day, track, fetch_day(client, day), tanks)
        written += upsert_series(db, docs)
        log.info("besttech %s: %d docs", key, len(docs))
    return written


def make_client() -> BesttechClient:
    return BesttechClient(os.getenv("BESTTECH_API", ""),
                          base_url=os.getenv("BESTTECH_BASE_URL", DEFAULT_BASE_URL),
                          spacing_s=float(os.getenv("BESTTECH_SPACING_S", "35")))


def main() -> None:
    yesterday = yesterday_bkk().strftime("%d/%m/%Y")
    start, end = os.getenv("START_DATE", yesterday), os.getenv("END_DATE", yesterday)
    job = JobLog("fuel_series_besttech", "fuel_series_besttech", {"start_date": start, "end_date": end})
    try:
        db = MongoClient(MONGODB_URI)["analytics"]
        written = run_days(make_client(), db, parse_days(start, end), force=os.getenv("FORCE") == "1")
        job.finish("success", records=written)
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests -q`
Expected: all tests pass (`7 passed` in `test_series_besttech.py`).

- [ ] **Step 5: Register the pipeline**

In `routes/pipeline/pipeline_routes.py`:
- in `PIPELINE_SCRIPTS`, after the line `"vehiclemaster": SCRIPTS_DIR / "engineon" / "pipeline_vehiclemaster.py",` add
  `    "fuel_series_besttech": SCRIPTS_DIR / "fuel" / "series_besttech.py",`
- in `PIPELINE_NAMES`, after `"vehiclemaster": "vehiclemaster",` add
  `                  "fuel_series_besttech": "fuel_series_besttech",`
- in `RUN_LOG_LOCATION`, after `"vehiclemaster": ("analytics", "etl_jobs"),` add
  `    "fuel_series_besttech": ("analytics", "etl_jobs"),`

Verify:
```bash
grep -c '"fuel_series_besttech"' routes/pipeline/pipeline_routes.py
.venv/bin/python -m py_compile routes/pipeline/pipeline_routes.py scripts/fuel/series_besttech.py && echo ok
```
Expected: `3` then `ok`.

- [ ] **Step 6: ⚠️ PROD (Besttech 25 calls ≈ 15 min, writes ~137 docs) — smoke run for yesterday**

Ask the user first. Then:
```bash
.venv/bin/python scripts/fuel/series_besttech.py 2>&1 | tail -3
.venv/bin/python - <<'EOF'
import sys; sys.path.insert(0, "scripts/fuel"); sys.path.insert(0, "scripts/engineon")
from collections import Counter
from common import MONGODB_URI, yesterday_bkk
from pymongo import MongoClient
from series_codec import decode_columns, fuel_to_litres
db = MongoClient(MONGODB_URI)["analytics"]; key = yesterday_bkk().date().isoformat()
docs = list(db.gps_series.find({"date_key": key, "source": "besttech"}))
print(len(docs), "docs", Counter(d["coverage"]["status"] for d in docs))
d = next(d for d in docs if d["n"] > 0)
lit = fuel_to_litres(decode_columns(d["cols"], d["n"])["fuel"], d["fuel_unit"], d["tank_l"])
print(d["plate"], d["n"], "minutes, fuel litres", round(float(lit[lit == lit].min()), 1), "->", round(float(lit[lit == lit].max()), 1))
print("bytes/doc ≈", sum(len(v) for v in d["cols"].values()))
EOF
```
Expected: ~137 docs, mostly `ok` with some `no_sensor` / `offline`; one plate with a sensible litre range (0–200); about 18 bytes × minutes per doc.

- [ ] **Step 7: Commit**

```bash
git add scripts/fuel/series_besttech.py scripts/fuel/tests/test_series_besttech.py routes/pipeline/pipeline_routes.py
git commit -m "feat(fuel): fuel_series_besttech pipeline (history_all → gps_series)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Terminus series job (`fuel_series_terminus`)

**Files:**
- Create: `scripts/fuel/series_terminus.py`
- Modify: `routes/pipeline/pipeline_routes.py`
- Test: `scripts/fuel/tests/test_series_terminus.py`

**Interfaces:**
- Consumes: Task 1 `normalize_plate`, `terminus_plate`, `ddmmyyyy`, `parse_days`, `parse_date_list`; Task 3 `Reading`, `build_series_doc`, `to_number`; Task 4 `ensure_indexes`, `upsert_series`, `load_tanks`, `tank_for`, `recent_plates`; `common` `MONGODB_URI`, `JobLog`, `log`, `yesterday_bkk`.
- Produces: `row_reading(row) -> Reading | None`, `terminus_day_docs(day, rows, tanks, silent_plates=(), now=None) -> list[dict]`, `ingest_terminus_day(terminus_db, db, day, plates=None, tanks=None, batch_pause_s=None) -> int`, `SOURCE = "terminus"`, `INDEX = "idx_date_plate_status_order_desc"`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_series_terminus.py`:
```python
from datetime import date

from series_codec import decode_columns
from series_terminus import row_reading, terminus_day_docs

DAY = date(2026, 10, 5)


def row(plate, t, fuel, status="จอดรถ", speed=0.0, latlng="13.6400, 100.5532", code="ME162"):
    return {"ทะเบียนพาหนะ": plate, "รหัสพาหนะ": code, "เวลา": t, "น้ำมัน": fuel,
            "ความเร็ว(กม./ชม.)": speed, "สถานะ": status, "พิกัด": latlng}


def test_row_reading_maps_fields():
    r = row_reading(row("71-8623", "08:00:10", 150.5, status="ดับเครื่อง"))
    assert (r.sec, r.fuel, r.engine, r.lat, r.lng) == (28810, 150.5, 0, 13.64, 100.5532)
    assert row_reading(row("71-8623", "08:00:10", 150.5, status="ความเร็วเกินกำหนด")).engine == 1


def test_row_reading_invalid_values():
    assert row_reading(row("71-8623", "nan", 1.0)) is None
    r = row_reading(row("71-8623", "08:00:00", float("nan"), latlng=float("nan")))
    assert r.fuel is None and r.lat is None and r.lng is None
    assert row_reading(row("71-8623", "08:00:00", 0.0)).fuel is None


def test_docs_per_plate_in_litres():
    rows = [row("71-8623", "08:00:10", 150.5), row("71-8623", "08:00:40", 150.7, status="รถวิ่ง", speed=20),
            row("71-8623", "08:01:05", float("nan"), status="ดับเครื่อง"),
            row("กว4506", "09:00:00", 60.0, code=None)]
    docs = {d["plate"]: d for d in terminus_day_docs(DAY, rows, {})}
    assert set(docs) == {"สบ.71-8623", "กว4506"}
    d = docs["สบ.71-8623"]
    assert d["fuel_unit"] == "dl" and d["truck_code"] == "ME162" and d["source"] == "terminus"
    cols = decode_columns(d["cols"], d["n"])
    assert cols["m"].tolist() == [480, 481]
    assert cols["fuel"].tolist() == [1506, -1]
    assert cols["speed"].tolist() == [20, 0]
    assert cols["engine"].tolist() == [1, 0]
    assert docs["กว4506"]["truck_code"] is None


def test_silent_plates_get_no_data_docs():
    docs = {d["plate"]: d for d in terminus_day_docs(DAY, [], {}, silent_plates={"สบ.70-0001"})}
    assert docs["สบ.70-0001"]["coverage"]["status"] == "no_data"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_series_terminus.py -q`
Expected: `ModuleNotFoundError: No module named 'series_terminus'`.

- [ ] **Step 3: Implement `scripts/fuel/series_terminus.py`**

```python
"""fuel_series_terminus — terminus.driving_log → analytics.gps_series (spec §3.3, §3.5).

Default day = yesterday (Bangkok). START_DATE / END_DATE (dd/mm/YYYY) or DATES (comma list of
dd/mm/YYYY) choose days; PLATES (comma list, any plate format) limits the trucks.
Reads go through the วันที่-first index in batches of 50 plates with a short pause in between
(TERMINUS_BATCH_SLEEP_S, default 0.5 s) — the cluster is small. น้ำมัน is litres; ระยะทาง(กม.) is
always 0, so distance comes from coordinates (series_build.path_km).
"""
import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log, yesterday_bkk  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from dates import ddmmyyyy, parse_date_list, parse_days  # noqa: E402
from plates import normalize_plate, terminus_plate  # noqa: E402
from series_build import Reading, build_series_doc, to_number  # noqa: E402
from series_store import ensure_indexes, load_tanks, recent_plates, tank_for, upsert_series  # noqa: E402

SOURCE = "terminus"
UNIT = "dl"
INDEX = "idx_date_plate_status_order_desc"
BATCH = 50
ENGINE_OFF = "ดับเครื่อง"
FIELDS = {"_id": 0, "ทะเบียนพาหนะ": 1, "รหัสพาหนะ": 1, "เวลา": 1, "น้ำมัน": 1,
          "ความเร็ว(กม./ชม.)": 1, "สถานะ": 1, "พิกัด": 1}


def _seconds(value) -> int | None:
    try:
        hours, minutes, seconds = (int(part) for part in str(value).split(":"))
    except ValueError:
        return None
    if not (0 <= hours < 24 and 0 <= minutes < 60 and 0 <= seconds < 60):
        return None
    return hours * 3600 + minutes * 60 + seconds


def _lat_lng(value) -> tuple[float | None, float | None]:
    try:
        lat, lng = (float(part) for part in str(value).split(","))
    except ValueError:
        return None, None
    return lat, lng


def row_reading(row: dict) -> Reading | None:
    sec = _seconds(row.get("เวลา"))
    if sec is None:
        return None
    fuel = to_number(row.get("น้ำมัน"))
    lat, lng = _lat_lng(row.get("พิกัด"))
    return Reading(sec=sec, fuel=fuel if fuel is not None and fuel > 0 else None,
                   speed=to_number(row.get("ความเร็ว(กม./ชม.)")) or 0.0,
                   engine=0 if row.get("สถานะ") == ENGINE_OFF else 1, lat=lat, lng=lng)


def terminus_day_docs(day: date, rows: list[dict], tanks: dict, silent_plates=(),
                      now: datetime | None = None) -> list[dict]:
    readings: dict[str, list[Reading]] = {}
    codes: dict[str, str] = {}
    for row in rows:
        plate = normalize_plate(row.get("ทะเบียนพาหนะ"))
        reading = row_reading(row)
        if not plate or reading is None:
            continue
        readings.setdefault(plate, []).append(reading)
        code = row.get("รหัสพาหนะ")
        if isinstance(code, str) and code.strip() and plate not in codes:
            codes[plate] = code.strip()
    docs = []
    for plate in sorted(set(readings) | set(silent_plates)):
        tank_l, tank_from = tank_for(tanks, plate)
        docs.append(build_series_doc(plate=plate, truck_code=codes.get(plate), day=day, source=SOURCE,
                                     unit=UNIT, tank_l=tank_l, tank_from=tank_from,
                                     readings=readings.get(plate, []), now=now))
    return docs


def ingest_terminus_day(terminus_db, db, day: date, plates: list[str] | None = None,
                        tanks: dict | None = None, batch_pause_s: float | None = None) -> int:
    driving_log = terminus_db["driving_log"]
    key = ddmmyyyy(day)
    pause = float(os.getenv("TERMINUS_BATCH_SLEEP_S", "0.5")) if batch_pause_s is None else batch_pause_s
    if plates:
        raw_plates = sorted({terminus_plate(p) for p in plates})
        expected: set[str] = set()
    else:
        raw_plates = sorted(driving_log.distinct("ทะเบียนพาหนะ", {"วันที่": key}))
        expected = recent_plates(db, SOURCE, day.isoformat())
    tanks = load_tanks(db) if tanks is None else tanks
    seen: set[str] = set()
    written = 0
    for i in range(0, len(raw_plates), BATCH):
        batch = raw_plates[i:i + BATCH]
        rows = list(driving_log.find({"วันที่": key, "ทะเบียนพาหนะ": {"$in": batch}}, FIELDS).hint(INDEX))
        docs = terminus_day_docs(day, rows, tanks)
        seen.update(d["plate"] for d in docs)
        written += upsert_series(db, docs)
        if pause and i + BATCH < len(raw_plates):
            time.sleep(pause)
    written += upsert_series(db, terminus_day_docs(day, [], tanks, silent_plates=expected - seen))
    log.info("terminus %s: %d docs from %d plates", day.isoformat(), written, len(raw_plates))
    return written


def main() -> None:
    yesterday = yesterday_bkk().strftime("%d/%m/%Y")
    dates_env = os.getenv("DATES", "").strip()
    days = parse_date_list(dates_env) if dates_env else parse_days(os.getenv("START_DATE", yesterday),
                                                                   os.getenv("END_DATE", yesterday))
    plates = [p.strip() for p in os.getenv("PLATES", "").split(",") if p.strip()] or None
    job = JobLog("fuel_series_terminus", "fuel_series_terminus",
                 {"first_day": days[0].isoformat(), "last_day": days[-1].isoformat(),
                  "days": len(days), "plates": len(plates or [])})
    try:
        client = MongoClient(MONGODB_URI)
        db = client["analytics"]
        ensure_indexes(db)
        tanks = load_tanks(db)
        written = sum(ingest_terminus_day(client["terminus"], db, day, plates=plates, tanks=tanks)
                      for day in days)
        job.finish("success", records=written)
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest scripts/fuel/tests -q`
Expected: all pass (`4 passed` in `test_series_terminus.py`).

- [ ] **Step 5: Register the pipeline**

In `routes/pipeline/pipeline_routes.py`, after each `fuel_series_besttech` line added in Task 6, add the matching line:
- `PIPELINE_SCRIPTS`: `    "fuel_series_terminus": SCRIPTS_DIR / "fuel" / "series_terminus.py",`
- `PIPELINE_NAMES`: `                  "fuel_series_terminus": "fuel_series_terminus",`
- `RUN_LOG_LOCATION`: `    "fuel_series_terminus": ("analytics", "etl_jobs"),`

Verify: `grep -c '"fuel_series_terminus"' routes/pipeline/pipeline_routes.py` → `3`; `.venv/bin/python -m py_compile routes/pipeline/pipeline_routes.py scripts/fuel/series_terminus.py && echo ok` → `ok`.

- [ ] **Step 6: ⚠️ PROD (reads one day of driving_log ≈ 519k rows, writes ~424 docs) — smoke run for yesterday**

Ask the user first. Then:
```bash
time .venv/bin/python scripts/fuel/series_terminus.py 2>&1 | tail -2
.venv/bin/python - <<'EOF'
import sys; sys.path.insert(0, "scripts/fuel"); sys.path.insert(0, "scripts/engineon")
from collections import Counter
from common import MONGODB_URI, yesterday_bkk
from pymongo import MongoClient
db = MongoClient(MONGODB_URI)["analytics"]; key = yesterday_bkk().date().isoformat()
docs = list(db.gps_series.find({"date_key": key, "source": "terminus"}, {"cols": 0}))
print(len(docs), "docs", Counter(d["coverage"]["status"] for d in docs))
print("non-standard plates kept:", [d["plate"] for d in docs if not d["plate"].startswith("สบ.")][:5])
EOF
```
Expected: ~424 docs in about a minute or two, ~80 % `ok`, ~20 % `no_sensor`; a few plates such as `กว4506` kept as written.

- [ ] **Step 7: Commit**

```bash
git add scripts/fuel/series_terminus.py scripts/fuel/tests/test_series_terminus.py routes/pipeline/pipeline_routes.py
git commit -m "feat(fuel): fuel_series_terminus pipeline (driving_log → gps_series)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Nightly chain and schedule (`fuel_nightly`)

**Files:**
- Create: `scripts/fuel/pipeline_fuel_nightly.py`
- Modify: `routes/pipeline/pipeline_routes.py`, `main.py` (scheduler block)
- Test: `scripts/fuel/tests/test_nightly.py`

**Interfaces:**
- Consumes: Task 6 `run_days`, `make_client`; Task 7 `ingest_terminus_day`; Task 4 `SERIES`, `count_series`, `ensure_indexes`; Task 1 `ddmmyyyy`.
- Produces: `terminus_ready(plates_today: int, plates_recent: list[int], ratio: float = 0.5) -> bool`, `recent_terminus_counts(db, day, lookback=7) -> list[int]`. Part 2 appends the `fuel_events` step to `main()`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_nightly.py`:
```python
from pipeline_fuel_nightly import terminus_ready


def test_ready_against_recent_average():
    assert terminus_ready(424, [420, 430, 0, 410])
    assert not terminus_ready(150, [420, 430, 410])
    assert terminus_ready(210, [420, 420])


def test_ready_without_history():
    assert terminus_ready(5, [])
    assert not terminus_ready(0, [0, 0])
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_nightly.py -q`
Expected: `ModuleNotFoundError: No module named 'pipeline_fuel_nightly'`.

- [ ] **Step 3: Implement `scripts/fuel/pipeline_fuel_nightly.py`**

```python
"""fuel_nightly (04:15 BKK) — spec §3.3, §6.

1. Besttech: if the 02:30 run left no docs for yesterday, run it once more (a failure is recorded
   and does not stop Terminus).
2. Terminus: wait until yesterday's driving_log has at least half the usual number of trucks
   (NIGHTLY_RETRIES × NIGHTLY_WAIT_S, default 3 × 30 min), then ingest; flag terminus_partial if
   it never got there.
Part 2 appends the fuel_events step.
"""
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log, yesterday_bkk  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from dates import ddmmyyyy  # noqa: E402
from series_besttech import make_client, run_days  # noqa: E402
from series_store import SERIES, count_series, ensure_indexes  # noqa: E402
from series_terminus import ingest_terminus_day  # noqa: E402

READY_RATIO = 0.5


def terminus_ready(plates_today: int, plates_recent: list[int], ratio: float = READY_RATIO) -> bool:
    """Ready when today's truck count reaches `ratio` × the recent daily average (any count with no history)."""
    recent = [count for count in plates_recent if count > 0]
    if not recent:
        return plates_today > 0
    return plates_today >= ratio * (sum(recent) / len(recent))


def recent_terminus_counts(db, day: date, lookback: int = 7) -> list[int]:
    return [db[SERIES].count_documents({"date_key": (day - timedelta(days=i)).isoformat(),
                                        "source": "terminus", "n": {"$gt": 0}})
            for i in range(1, lookback + 1)]


def main() -> None:
    day = yesterday_bkk().date()
    retries = int(os.getenv("NIGHTLY_RETRIES", "3"))
    wait_s = float(os.getenv("NIGHTLY_WAIT_S", "1800"))
    job = JobLog("fuel_nightly", "fuel_nightly", {"day": day.isoformat()})
    result: dict = {}
    try:
        client = MongoClient(MONGODB_URI)
        db = client["analytics"]
        ensure_indexes(db)

        if count_series(db, day.isoformat(), "besttech") == 0:
            try:
                result["besttech_catchup_docs"] = run_days(make_client(), db, [day])
            except Exception as e:  # Terminus must still run when Besttech is down
                log.error("besttech catch-up failed: %s", e)
                result["besttech_error"] = str(e)

        driving_log = client["terminus"]["driving_log"]
        recent = recent_terminus_counts(db, day)
        today = 0
        for attempt in range(retries + 1):
            today = len(driving_log.distinct("ทะเบียนพาหนะ", {"วันที่": ddmmyyyy(day)}))
            if terminus_ready(today, recent) or attempt == retries:
                break
            log.info("terminus %s not ready (%d trucks) — waiting %.0fs", day, today, wait_s)
            time.sleep(wait_s)
        result["terminus_partial"] = not terminus_ready(today, recent)
        result["terminus_docs"] = ingest_terminus_day(client["terminus"], db, day)
        job.finish("success", **result)
    except Exception as e:
        job.finish("failed", error=str(e), **result)
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest scripts/fuel/tests -q`
Expected: all pass (`2 passed` in `test_nightly.py`).

- [ ] **Step 5: Register the pipeline and schedule it**

In `routes/pipeline/pipeline_routes.py`, after each `fuel_series_terminus` line, add:
- `PIPELINE_SCRIPTS`: `    "fuel_nightly": SCRIPTS_DIR / "fuel" / "pipeline_fuel_nightly.py",`
- `PIPELINE_NAMES`: `                  "fuel_nightly": "fuel_nightly",`
- `RUN_LOG_LOCATION`: `    "fuel_nightly": ("analytics", "etl_jobs"),`

In `main.py`, directly after the line that schedules `engineon_trip_summary` (`scheduler.add_job(_run, CronTrigger(hour=23, minute=30), args=["engineon_trip_summary"], ...)`), add:
```python
    # fuel series (fuel-control-center spec 2026-10-06) — BKK→UTC −7:
    # Besttech /history_all for yesterday at 02:30 BKK → 19:30 UTC (~15 min at 35 s per call);
    # fuel_nightly at 04:15 BKK → 21:15 UTC: Besttech catch-up if empty, then Terminus once
    # engine-on (21:00 UTC, ~1 min) has read the same day — done before stockmovement at 22:00 UTC
    scheduler.add_job(_run, CronTrigger(hour=19, minute=30), args=["fuel_series_besttech"], id="sched_fuel_series_besttech")  # 02:30 BKK
    scheduler.add_job(_run, CronTrigger(hour=21, minute=15), args=["fuel_nightly"], id="sched_fuel_nightly")                  # 04:15 BKK
```

Verify:
```bash
grep -n 'sched_fuel_' main.py
grep -c '"fuel_nightly"' routes/pipeline/pipeline_routes.py
.venv/bin/python -m py_compile main.py routes/pipeline/pipeline_routes.py scripts/fuel/pipeline_fuel_nightly.py && echo ok
```
Expected: two `sched_fuel_` lines, `3`, `ok`.

- [ ] **Step 6: Commit**

```bash
git add scripts/fuel/pipeline_fuel_nightly.py scripts/fuel/tests/test_nightly.py routes/pipeline/pipeline_routes.py main.py
git commit -m "feat(fuel): fuel_nightly chain + schedule (Besttech 02:30, nightly 04:15 BKK)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tank sizes (`fuel_tanks`)

**Files:**
- Create: `scripts/fuel/tanks.py`, `scripts/fuel/pipeline_fuel_tanks.py`
- Modify: `routes/pipeline/pipeline_routes.py`
- Test: `scripts/fuel/tests/test_tanks.py`

**Interfaces:**
- Consumes: Task 1 `normalize_plate`; Task 2 `decode_column`, `decode_columns`; Task 4 `SERIES`, `TANKS`; `common` `MONGODB_URI`, `JobLog`, `log`, `now_bkk`.
- Produces: `parse_capacity(raw) -> float | None`, `pair_minutes(bt_cols, te_cols) -> list[tuple[float, float]]` (percent, litres), `fit_tank(pairs) -> tuple[float, float, int] | None` (tank_l, r², n), `observed_tank(max_litres) -> float | None`, `resolve_tank(atms_l=None, fit=None, observed_l=None) -> dict` (`tank_l`, `tank_from`, optional `fit_r2`, `n_pairs`); `fuel_tanks` docs `{_id: plate, tank_l, tank_from, fit_r2?, n_pairs?, updated_at}`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_tanks.py`:
```python
import numpy as np
import pytest

from tanks import fit_tank, observed_tank, pair_minutes, parse_capacity, resolve_tank


@pytest.mark.parametrize("raw,expected", [
    ("200", 200.0), ("200L", 200.0), (200, 200.0), ("1,000", 1000.0),
    (float("nan"), None), ("", None), (None, None), (5, None), ("abc", None),
])
def test_parse_capacity(raw, expected):
    assert parse_capacity(raw) == expected


def cols(m, fuel, speed):
    return {"m": np.array(m, dtype="uint16"), "fuel": np.array(fuel, dtype="int16"),
            "speed": np.array(speed, dtype="uint8")}


def test_pair_minutes_same_minute_both_parked_valid():
    bt = cols([10, 11, 12, 13], [5000, 5000, -1, 4000], [0, 30, 0, 0])
    te = cols([10, 11, 12, 14], [1000, 1000, 900, 800], [0, 0, 0, 0])
    assert pair_minutes(bt, te) == [(50.0, 100.0)]


def test_fit_tank_recovers_size():
    rng = np.random.default_rng(1)
    pct = rng.uniform(20, 100, 300)
    tank_l, r2, n = fit_tank(list(zip(pct, 2.0 * pct + rng.normal(0, 1, 300))))
    assert tank_l == pytest.approx(200, abs=1) and r2 > 0.99 and n == 300


def test_fit_tank_needs_usable_pairs():
    assert fit_tank([]) is None and fit_tank([(50.0, 100.0)]) is None
    assert fit_tank([(0.0, 1.0), (0.0, 2.0)]) is None


def test_observed_tank_rounds_up():
    assert observed_tank(199.0) == 200.0 and observed_tank(76.2) == 80.0
    assert observed_tank(None) is None and observed_tank(12.0) is None


def test_resolve_priority():
    good = (183.0, 0.95, 400)
    assert resolve_tank(atms_l=200.0, fit=good)["tank_from"] == "atms"
    assert resolve_tank(fit=good) == {"tank_l": 183.0, "tank_from": "calibrated", "fit_r2": 0.95, "n_pairs": 400}
    assert resolve_tank(fit=(183.0, 0.7, 400), observed_l=200.0)["tank_from"] == "observed"
    assert resolve_tank(fit=(183.0, 0.95, 50))["tank_from"] == "default"
    assert resolve_tank() == {"tank_l": 200.0, "tank_from": "default"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_tanks.py -q`
Expected: `ModuleNotFoundError: No module named 'tanks'`.

- [ ] **Step 3: Implement `scripts/fuel/tanks.py`**

```python
"""Tank-size helpers for fuel_tanks (spec §3.4) — pure functions."""
import math
import re

import numpy as np

MIN_TANK_L, MAX_TANK_L = 40.0, 1000.0
DEFAULT_TANK_L = 200.0
CALIB_MIN_R2, CALIB_MIN_PAIRS = 0.9, 200
PARKED_KMH = 5
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


def parse_capacity(raw) -> float | None:
    """ATMS ความจุถังน้ำมัน → litres ("200", "200L", 200 → 200.0); None when missing or implausible."""
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        value = float(raw)
    else:
        match = _NUMBER.search(str(raw).replace(",", ""))
        if not match:
            return None
        value = float(match.group(0))
    if not math.isfinite(value) or not MIN_TANK_L <= value <= MAX_TANK_L:
        return None
    return value


def pair_minutes(bt: dict, te: dict) -> list[tuple[float, float]]:
    """(percent, litres) for minutes where both boxes have valid fuel and both trucks read as parked.
    bt: decoded Besttech columns (centi-percent); te: decoded Terminus columns (deci-litres)."""
    _, bi, ti = np.intersect1d(bt["m"], te["m"], return_indices=True)
    bt_fuel = bt["fuel"][bi].astype(float)
    te_fuel = te["fuel"][ti].astype(float)
    ok = ((bt_fuel > 0) & (te_fuel > 0)
          & (bt["speed"][bi] <= PARKED_KMH) & (te["speed"][ti] <= PARKED_KMH))
    return list(zip((bt_fuel[ok] / 100.0).tolist(), (te_fuel[ok] / 10.0).tolist()))


def fit_tank(pairs: list[tuple[float, float]]) -> tuple[float, float, int] | None:
    """Least squares through the origin, litres = k × percent → (tank_l = 100 k, r², n)."""
    if len(pairs) < 2:
        return None
    x = np.array([p for p, _ in pairs], dtype=float)
    y = np.array([litres for _, litres in pairs], dtype=float)
    sxx = float((x * x).sum())
    if sxx == 0:
        return None
    k = float((x * y).sum()) / sxx
    sst = float(((y - y.mean()) ** 2).sum())
    r2 = 1.0 - float(((y - k * x) ** 2).sum()) / sst if sst > 0 else 0.0
    return 100.0 * k, r2, len(pairs)


def observed_tank(max_litres: float | None) -> float | None:
    """Largest litre reading → tank size rounded up to 10 L (Terminus maxima cluster at ~80/200/390)."""
    if max_litres is None or not math.isfinite(max_litres) or max_litres <= 0:
        return None
    value = math.ceil(max_litres / 10.0) * 10.0
    return value if MIN_TANK_L <= value <= MAX_TANK_L else None


def resolve_tank(atms_l: float | None = None, fit: tuple[float, float, int] | None = None,
                 observed_l: float | None = None) -> dict:
    fit_info = {"fit_r2": round(fit[1], 4), "n_pairs": fit[2]} if fit else {}
    if atms_l:
        return {"tank_l": float(atms_l), "tank_from": "atms", **fit_info}
    if fit and fit[1] >= CALIB_MIN_R2 and fit[2] >= CALIB_MIN_PAIRS and MIN_TANK_L <= fit[0] <= MAX_TANK_L:
        return {"tank_l": round(fit[0], 1), "tank_from": "calibrated", **fit_info}
    if observed_l:
        return {"tank_l": float(observed_l), "tank_from": "observed", **fit_info}
    return {"tank_l": DEFAULT_TANK_L, "tank_from": "default", **fit_info}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_tanks.py -q`
Expected: `14 passed`.

- [ ] **Step 5: Implement `scripts/fuel/pipeline_fuel_tanks.py`**

```python
"""fuel_tanks — tank size per plate and re-stamp of tank_l / tank_from on gps_series (spec §3.4).

Order: ATMS ความจุถังน้ำมัน → calibrated (Besttech % vs Terminus litres in the same minute, both
parked, CALIB_FROM..CALIB_TO, default 2026-06-01..2026-08-31) → observed (largest litre reading in
the last 30 days, rounded up to 10 L) → 200 L default. Only metadata is updated; columns stay as-is.
"""
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log, now_bkk  # noqa: E402
from pymongo import MongoClient, ReplaceOne  # noqa: E402

from plates import normalize_plate  # noqa: E402
from series_codec import decode_column, decode_columns  # noqa: E402
from series_store import SERIES, TANKS  # noqa: E402
from tanks import fit_tank, observed_tank, pair_minutes, parse_capacity, resolve_tank  # noqa: E402

OBSERVED_DAYS = 30


def atms_capacities(atms_db) -> dict[str, float]:
    out = {}
    for doc in atms_db["vehiclemaster"].find({}, {"ทะเบียน": 1, "ความจุถังน้ำมัน": 1}):
        plate, capacity = normalize_plate(doc.get("ทะเบียน")), parse_capacity(doc.get("ความจุถังน้ำมัน"))
        if plate and capacity:
            out[plate] = capacity
    return out


def calibration_pairs(db, date_from: str, date_to: str) -> dict[str, list[tuple[float, float]]]:
    pairs: dict[str, list[tuple[float, float]]] = defaultdict(list)
    query = {"source": "besttech", "n": {"$gt": 0}, "date_key": {"$gte": date_from, "$lte": date_to}}
    for bt in db[SERIES].find(query, {"plate": 1, "date_key": 1, "n": 1, "cols": 1}):
        te = db[SERIES].find_one({"_id": f"{bt['plate']}|{bt['date_key']}|terminus", "n": {"$gt": 0}},
                                 {"n": 1, "cols": 1})
        if te:
            pairs[bt["plate"]] += pair_minutes(decode_columns(bt["cols"], bt["n"]),
                                               decode_columns(te["cols"], te["n"]))
    return pairs


def observed_maxima(db, since: str) -> dict[str, float]:
    best: dict[str, float] = {}
    query = {"fuel_unit": "dl", "n": {"$gt": 0}, "date_key": {"$gte": since}}
    for doc in db[SERIES].find(query, {"plate": 1, "n": 1, "cols.fuel_hi": 1}):
        high = decode_column(doc["cols"]["fuel_hi"], "fuel_hi", doc["n"])
        high = high[high >= 0]
        if high.size:
            best[doc["plate"]] = max(best.get(doc["plate"], 0.0), float(high.max()) / 10.0)
    return best


def main() -> None:
    date_from = os.getenv("CALIB_FROM", "2026-06-01")
    date_to = os.getenv("CALIB_TO", "2026-08-31")
    job = JobLog("fuel_tanks", "fuel_tanks", {"calib_from": date_from, "calib_to": date_to})
    try:
        client = MongoClient(MONGODB_URI)
        db = client["analytics"]
        atms = atms_capacities(client["atms"])
        pairs = calibration_pairs(db, date_from, date_to)
        observed = observed_maxima(db, (now_bkk().date() - timedelta(days=OBSERVED_DAYS)).isoformat())
        stamp = datetime.now(timezone.utc).replace(tzinfo=None)
        counts: dict[str, int] = defaultdict(int)
        ops = []
        for plate in db[SERIES].distinct("plate"):
            tank = resolve_tank(atms_l=atms.get(plate), fit=fit_tank(pairs.get(plate, [])),
                                observed_l=observed_tank(observed.get(plate)))
            counts[tank["tank_from"]] += 1
            ops.append(ReplaceOne({"_id": plate}, {"_id": plate, **tank, "updated_at": stamp}, upsert=True))
            db[SERIES].update_many(
                {"plate": plate, "$or": [{"tank_l": {"$ne": tank["tank_l"]}},
                                         {"tank_from": {"$ne": tank["tank_from"]}}]},
                {"$set": {"tank_l": tank["tank_l"], "tank_from": tank["tank_from"]}})
        if ops:
            db[TANKS].bulk_write(ops, ordered=False)
        log.info("fuel_tanks: %s", dict(counts))
        job.finish("success", records=len(ops), **{f"from_{k}": v for k, v in counts.items()})
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Register the pipeline**

In `routes/pipeline/pipeline_routes.py`, after each `fuel_nightly` line, add:
- `PIPELINE_SCRIPTS`: `    "fuel_tanks": SCRIPTS_DIR / "fuel" / "pipeline_fuel_tanks.py",`
- `PIPELINE_NAMES`: `                  "fuel_tanks": "fuel_tanks",`
- `RUN_LOG_LOCATION`: `    "fuel_tanks": ("analytics", "etl_jobs"),`

Verify: `grep -c '"fuel_tanks"' routes/pipeline/pipeline_routes.py` → `3`; `.venv/bin/python -m py_compile routes/pipeline/pipeline_routes.py scripts/fuel/pipeline_fuel_tanks.py && echo ok` → `ok`; `.venv/bin/python -m pytest scripts/fuel/tests -q` → all pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/fuel/tanks.py scripts/fuel/pipeline_fuel_tanks.py scripts/fuel/tests/test_tanks.py routes/pipeline/pipeline_routes.py
git commit -m "feat(fuel): fuel_tanks — ATMS / calibrated / observed / default tank sizes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Backfill (review truck-days script + runbook)

**Files:**
- Create: `scripts/fuel/backfill_terminus_reviews.py`
- Test: `scripts/fuel/tests/test_backfill_reviews.py`

**Interfaces:**
- Consumes: Task 1 `normalize_plate`; Task 4 `ensure_indexes`, `load_tanks`; Task 7 `ingest_terminus_day`; all jobs from Tasks 6, 7, 9.
- Produces: `review_truck_days(reviews, first_day=date(2026, 3, 1)) -> dict[date, set[str]]`; filled `gps_series` and `fuel_tanks`.

- [ ] **Step 1: Write the failing test**

`scripts/fuel/tests/test_backfill_reviews.py`:
```python
from datetime import date, datetime, timedelta, timezone

from backfill_terminus_reviews import review_truck_days

TH = timezone(timedelta(hours=7))


def ts(y, m, d, h=12):
    return int(datetime(y, m, d, h, tzinfo=TH).timestamp() * 1000)


def test_multi_day_window():
    plan = review_truck_days([{"plate": "71-4247", "start_ts": ts(2026, 3, 10), "end_ts": ts(2026, 3, 12)}])
    assert plan == {date(2026, 3, 10): {"สบ.71-4247"}, date(2026, 3, 11): {"สบ.71-4247"},
                    date(2026, 3, 12): {"สบ.71-4247"}}


def test_window_clamped_to_terminus_start():
    plan = review_truck_days([{"plate": "71-4247", "start_ts": ts(2026, 2, 27), "end_ts": ts(2026, 3, 1)}])
    assert list(plan) == [date(2026, 3, 1)]


def test_old_or_invalid_reviews_skipped():
    assert review_truck_days([
        {"plate": "71-4247", "start_ts": ts(2026, 1, 5), "end_ts": ts(2026, 1, 9)},
        {"plate": "", "start_ts": ts(2026, 3, 5), "end_ts": ts(2026, 3, 5)},
        {"plate": "71-0001", "start_ts": None, "end_ts": ts(2026, 3, 5)},
    ]) == {}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/fuel/tests/test_backfill_reviews.py -q`
Expected: `ModuleNotFoundError: No module named 'backfill_terminus_reviews'`.

- [ ] **Step 3: Implement `scripts/fuel/backfill_terminus_reviews.py`**

```python
"""One-off: Terminus gps_series for the truck-days behind analytics.fuel_drop_reviews (spec §3.5).

These become the weak training labels in Part 2. Terminus raw data starts 2026-03-01, so earlier
review windows are clamped (and windows that end before then are skipped).
Run locally: .venv/bin/python scripts/fuel/backfill_terminus_reviews.py
"""
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engineon"))
from common import MONGODB_URI, JobLog, log  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from plates import normalize_plate  # noqa: E402
from series_store import ensure_indexes, load_tanks  # noqa: E402
from series_terminus import ingest_terminus_day  # noqa: E402

TH_TZ = timezone(timedelta(hours=7))
TERMINUS_START = date(2026, 3, 1)


def review_truck_days(reviews: list[dict], first_day: date = TERMINUS_START) -> dict[date, set[str]]:
    days: dict[date, set[str]] = defaultdict(set)
    for review in reviews:
        plate = normalize_plate(review.get("plate"))
        start_ts, end_ts = review.get("start_ts"), review.get("end_ts")
        if not plate or start_ts is None or end_ts is None:
            continue
        day = max(datetime.fromtimestamp(start_ts / 1000, TH_TZ).date(), first_day)
        last = datetime.fromtimestamp(end_ts / 1000, TH_TZ).date()
        while day <= last:
            days[day].add(plate)
            day += timedelta(days=1)
    return dict(days)


def main() -> None:
    job = JobLog("fuel_backfill_reviews", "fuel_backfill_reviews")
    try:
        client = MongoClient(MONGODB_URI)
        db = client["analytics"]
        ensure_indexes(db)
        reviews = list(db["fuel_drop_reviews"].find({}, {"plate": 1, "start_ts": 1, "end_ts": 1}))
        plan = review_truck_days(reviews)
        tanks = load_tanks(db)
        written = 0
        for day in sorted(plan):
            written += ingest_terminus_day(client["terminus"], db, day, plates=sorted(plan[day]), tanks=tanks)
        log.info("review backfill: %d days, %d docs", len(plan), written)
        job.finish("success", records=written, days=len(plan),
                   truck_days=sum(len(p) for p in plan.values()))
    except Exception as e:
        job.finish("failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest scripts/fuel/tests -q`
Expected: all pass (`3 passed` in `test_backfill_reviews.py`).

- [ ] **Step 5: Commit**

```bash
git add scripts/fuel/backfill_terminus_reviews.py scripts/fuel/tests/test_backfill_reviews.py
git commit -m "feat(fuel): one-off Terminus backfill for reviewed truck-days

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: ⚠️ PROD (Besttech ≈ 3,200 calls over hours; ~0.25 GB written) — Besttech backfill from 26 May**

Ask the user first. Use the spacing measured in Task 5 Step 5 (35 if not measured). It is resumable: re-running skips complete days.
```bash
END=$(date -v-1d +%d/%m/%Y)
caffeinate -is env START_DATE=26/05/2026 END_DATE=$END BESTTECH_SPACING_S=${SPACING:-35} \
  .venv/bin/python scripts/fuel/series_besttech.py 2>&1 | tee ~/fuel_backfill_besttech.log
```
Expected: one `besttech YYYY-MM-DD: N docs` line per day, N ≈ 137. If it stops, run the same command again.

- [ ] **Step 7: ⚠️ PROD (Terminus reads, ~716 truck-days) — review truck-days**

Ask the user first. Can run while Step 6 is going (different system).
```bash
.venv/bin/python scripts/fuel/backfill_terminus_reviews.py 2>&1 | tail -2
```
Expected: `review backfill: … days, … docs` with roughly 700 docs.

- [ ] **Step 8: ⚠️ PROD (Terminus reads 30 days ≈ 15M rows, throttled) — last 30 days**

Ask the user first.
```bash
START=$(date -v-30d +%d/%m/%Y); END=$(date -v-1d +%d/%m/%Y)
time env START_DATE=$START END_DATE=$END .venv/bin/python scripts/fuel/series_terminus.py 2>&1 | tail -3
```
Expected: 30 `terminus YYYY-MM-DD: …` lines, about 424 docs each.

- [ ] **Step 9: ⚠️ PROD — calibration dates for Besttech plates (after Step 6 has passed 22/08/2026)**

Ask the user first.
```bash
PLATES=$(.venv/bin/python - <<'EOF'
import sys; sys.path.insert(0, "scripts/engineon")
from common import MONGODB_URI
from pymongo import MongoClient
print(",".join(sorted(MongoClient(MONGODB_URI)["analytics"].gps_series.distinct("plate", {"source": "besttech"}))))
EOF
)
env DATES=01/06/2026,08/06/2026,15/06/2026,22/06/2026,01/07/2026,08/07/2026,15/07/2026,22/07/2026,01/08/2026,08/08/2026,15/08/2026,22/08/2026 \
  PLATES="$PLATES" .venv/bin/python scripts/fuel/series_terminus.py 2>&1 | tail -3
```
Expected: 12 `terminus …` lines; most Besttech plates have Terminus data on the June/July dates.

- [ ] **Step 10: ⚠️ PROD — tank sizes**

Ask the user first.
```bash
.venv/bin/python scripts/fuel/pipeline_fuel_tanks.py 2>&1 | tail -2
```
Expected: `fuel_tanks: {'atms': …, 'calibrated': …, 'observed': …, 'default': …}`; most Besttech plates `calibrated`, most Terminus plates `observed`.

- [ ] **Step 11: Verify the backfill**

```bash
.venv/bin/python - <<'EOF'
import sys; sys.path.insert(0, "scripts/fuel"); sys.path.insert(0, "scripts/engineon")
from collections import Counter
from common import MONGODB_URI
from pymongo import MongoClient
from series_codec import decode_columns, fuel_to_litres
db = MongoClient(MONGODB_URI)["analytics"]
rows = db.gps_series.aggregate([{"$group": {"_id": {"m": {"$substr": ["$date_key", 0, 7]}, "s": "$source"}, "n": {"$sum": 1}}}, {"$sort": {"_id": 1}}])
for r in rows: print(r["_id"]["m"], r["_id"]["s"], r["n"])
st = db.command("collStats", "gps_series", scale=1024 * 1024)
print(f"gps_series: {st['count']} docs, {st['storageSize']:.0f} MB on disk")
print("tank_from:", Counter(d["tank_from"] for d in db.fuel_tanks.find({}, {"tank_from": 1})))
d = db.gps_series.find_one({"_id": "สบ.71-8635|2026-10-05|besttech"})
lit = fuel_to_litres(decode_columns(d["cols"], d["n"])["fuel"], d["fuel_unit"], d["tank_l"])
print("ME152 2026-10-05:", d["tank_l"], d["tank_from"], "first/last litres", round(float(lit[lit == lit][0]), 1), round(float(lit[lit == lit][-1]), 1))
EOF
```
Expected: Besttech rows from 2026-05 onward (~137/day), Terminus for the backfilled days; storage in line with ~18 KB/doc; ME152 on 2026-10-05 falling from ~55 % to ~36 % of its tank (≈ 110 L → 72 L on a 200 L tank). Report the numbers to the user.

---

### Task 11: Series decoder in fuel-control-center (TypeScript)

**Files:**
- Create: `src/lib/series-codec.ts`
- Create: `src/lib/__fixtures__/series-codec-sample.json` (generated by the Python codec)
- Test: `src/lib/series-codec.test.mjs`
- Modify: `package.json` (`scripts.test`)

**Interfaces:**
- Consumes: Task 2 `encode_columns` (to generate the fixture).
- Produces (for Part 3): `type FuelUnit = "dl" | "cpct"`, `type SeriesColumns = { m, fuel, fuelLo, fuelHi, speed, engine, lat, lng: number[] }`, `type BinaryLike`, `ENC_VERSION`, `FUEL_MISSING`, `decodeColumns(cols: Record<string, BinaryLike>, n: number): SeriesColumns`, `fuelToLitres(values: number[], unit: FuelUnit, tankL: number): (number | null)[]`, `toDegrees(values: number[]): (number | null)[]`.

- [ ] **Step 1: Create the FCC worktree**

```bash
cd ~/Documents/project/fuel-control-center/fuel-control-center
git pull --ff-only
git worktree add -b feat/fuel-redesign ../fcc-fuel main
cd ../fcc-fuel
ln -s ../fuel-control-center/node_modules node_modules
```

- [ ] **Step 2: Generate the cross-language fixture with the Python codec**

```bash
cd ~/Documents/project/ncac/api-ncac-fuel && .venv/bin/python - <<'EOF'
import base64, json, os, sys
sys.path.insert(0, "scripts/fuel")
import numpy as np
from series_codec import encode_columns
cols = {"m": np.array([0, 1, 1439]), "fuel": np.array([1824, -1, 0]), "fuel_lo": np.array([1800, -1, 0]),
        "fuel_hi": np.array([1850, -1, 0]), "speed": np.array([0, 45, 255]), "engine": np.array([0, 1, 1]),
        "lat": np.array([1379576, 0, 1428651]), "lng": np.array([10055717, 0, 10078388])}
raw = encode_columns(cols)
out = {"enc": 1, "n": 3, "cols": {k: base64.b64encode(v).decode() for k, v in raw.items()},
       "expected": {k: v.tolist() for k, v in cols.items()}}
path = os.path.expanduser("~/Documents/project/fuel-control-center/fcc-fuel/src/lib/__fixtures__/series-codec-sample.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(out, f, indent=1)
print("wrote", path)
EOF
```

- [ ] **Step 3: Write the failing test**

`src/lib/series-codec.test.mjs`:
```js
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { decodeColumns, fuelToLitres, toDegrees } from "./series-codec.ts"

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/series-codec-sample.json", import.meta.url), "utf8"),
)

test("decodes columns written by the Python codec", () => {
  const cols = decodeColumns(fixture.cols, fixture.n)
  assert.deepEqual(cols.m, fixture.expected.m)
  assert.deepEqual(cols.fuel, fixture.expected.fuel)
  assert.deepEqual(cols.fuelLo, fixture.expected.fuel_lo)
  assert.deepEqual(cols.fuelHi, fixture.expected.fuel_hi)
  assert.deepEqual(cols.speed, fixture.expected.speed)
  assert.deepEqual(cols.engine, fixture.expected.engine)
  assert.deepEqual(cols.lat, fixture.expected.lat)
  assert.deepEqual(cols.lng, fixture.expected.lng)
})

test("reads Binary-like values with a byte offset", () => {
  const backing = Uint8Array.from([9, 9, 1, 0, 0, 1, 7])
  const cols = { ...fixture.cols, m: { buffer: backing.subarray(2), position: 4 } }
  assert.deepEqual(decodeColumns(cols, 2).m, [1, 256])
})

test("rejects short or missing columns", () => {
  assert.throws(() => decodeColumns({ ...fixture.cols, m: new Uint8Array(2) }, 3), /column m/)
  const { lng, ...rest } = fixture.cols
  assert.throws(() => decodeColumns(rest, 3), /lng is missing/)
})

test("converts fuel and degrees", () => {
  assert.deepEqual(fuelToLitres([5525, -1], "cpct", 200), [110.5, null])
  assert.deepEqual(fuelToLitres([1824], "dl", 0), [182.4])
  assert.deepEqual(toDegrees([1379576, 0]), [13.79576, null])
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test src/lib/series-codec.test.mjs`
Expected: FAIL with `Cannot find module '.../src/lib/series-codec.ts'`.

- [ ] **Step 5: Implement `src/lib/series-codec.ts`**

```ts
// Decoder for analytics.gps_series packed columns (enc version 1, spec §3.1).
// Mirrors api-ncac scripts/fuel/series_codec.py — change both together.
// Written with erasable TypeScript only so `node --test` can run it without a build step.

export type FuelUnit = "dl" | "cpct"

export type SeriesColumns = {
  m: number[]
  fuel: number[]
  fuelLo: number[]
  fuelHi: number[]
  speed: number[]
  engine: number[]
  lat: number[]
  lng: number[]
}

/** A Mongo Binary (bson), raw bytes, or base64 text. */
export type BinaryLike = Uint8Array | string | { buffer: Uint8Array; position?: number }

export const ENC_VERSION = 1
export const FUEL_MISSING = -1

type Kind = "u1" | "u2" | "i2" | "i4"

const READERS: Record<Kind, { size: number; read: (view: DataView, offset: number) => number }> = {
  u1: { size: 1, read: (view, offset) => view.getUint8(offset) },
  u2: { size: 2, read: (view, offset) => view.getUint16(offset, true) },
  i2: { size: 2, read: (view, offset) => view.getInt16(offset, true) },
  i4: { size: 4, read: (view, offset) => view.getInt32(offset, true) },
}

const COLUMNS: ReadonlyArray<readonly [keyof SeriesColumns, string, Kind]> = [
  ["m", "m", "u2"],
  ["fuel", "fuel", "i2"],
  ["fuelLo", "fuel_lo", "i2"],
  ["fuelHi", "fuel_hi", "i2"],
  ["speed", "speed", "u1"],
  ["engine", "engine", "u1"],
  ["lat", "lat", "i4"],
  ["lng", "lng", "i4"],
]

function toBytes(value: BinaryLike): Uint8Array {
  if (typeof value === "string") {
    const text = atob(value)
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
    return bytes
  }
  if (value instanceof Uint8Array) return value
  return value.buffer.subarray(0, value.position ?? value.buffer.length)
}

export function decodeColumns(cols: Record<string, BinaryLike>, n: number): SeriesColumns {
  const out = {} as SeriesColumns
  for (const [key, field, kind] of COLUMNS) {
    const raw = cols[field]
    if (raw === undefined) throw new Error(`gps_series column ${field} is missing`)
    const bytes = toBytes(raw)
    const { size, read } = READERS[kind]
    if (bytes.byteLength < n * size) {
      throw new Error(`gps_series column ${field} has ${bytes.byteLength} bytes, needs ${n * size}`)
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const values = new Array<number>(n)
    for (let i = 0; i < n; i++) values[i] = read(view, i * size)
    out[key] = values
  }
  return out
}

/** Fuel column → litres; null where the minute had no valid reading. */
export function fuelToLitres(values: number[], unit: FuelUnit, tankL: number): (number | null)[] {
  return values.map((v) => {
    if (v < 0) return null
    return unit === "dl" ? v / 10 : ((v / 100) * tankL) / 100
  })
}

/** lat/lng column (degrees × 1e5) → degrees; null where no position was recorded. */
export function toDegrees(values: number[]): (number | null)[] {
  return values.map((v) => (v === 0 ? null : v / 1e5))
}
```

- [ ] **Step 6: Run the test, type-check, and add the npm script**

Add to `package.json` `"scripts"`: `"test": "node --test \"src/**/*.test.mjs\""`.

Run:
```bash
npm test
node_modules/.bin/tsc --noEmit --strict --target ES2020 --module esnext --moduleResolution bundler --lib ES2020,DOM src/lib/series-codec.ts && echo typecheck-ok
```
Expected: `ℹ pass 4` and `ℹ fail 0` (Node 25's default reporter), then `typecheck-ok`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/series-codec.ts src/lib/series-codec.test.mjs src/lib/__fixtures__/series-codec-sample.json package.json
git commit -m "feat(fuel): gps_series column decoder + cross-language fixture test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After Part 1 (needs the user's approval — not part of these tasks)

1. Final review of `feat/fuel-gps-series` (api-ncac) and `feat/fuel-redesign` (fuel-control-center).
2. Add `BESTTECH_API` to the api-ncac service env on Render (same value as `scripts/.env`).
3. Merge `feat/fuel-gps-series` into api-ncac `main` and push → Render deploys; check the next morning that `etl_jobs` has `fuel_series_besttech` (≈ 02:30) and `fuel_nightly` (≈ 04:15) with `status: success`.
4. Part 2 plan (detection, ML, `fuel_places`, `fuel_train`) builds on these collections.
