# Fuel Control Center — System Logic Reference

> อัปเดตล่าสุด: 2026-07-31 · ครอบคลุม frontend (Next.js บน Vercel), ETL backend (api-ncac บน Render) และ data pipeline ทั้งหมด
> เวอร์ชันหน้าเว็บ: ดูแบบภาพรวมได้ที่ `/docs` บนตัวแอป

---

## 1. ภาพรวมระบบ (Big Picture)

```
แหล่งข้อมูล                    ETL (api-ncac.onrender.com)              MongoDB                          หน้าจอ
─────────────                 ────────────────────────────             ────────────                     ──────────
ATMS (mena-atms.com)  ──────▶ drivercost_ticket (06:10)  ──────▶ atms.driver_cost_ticket ──┐
  · monthly-driver-cost                                                                    ├▶ engineon_trip_summary ──▶ /engineon
  · vehicle master    ──────▶ vehiclemaster (manual)     ──────▶ atms.vehiclemaster     ──┤      (06:30)
GPS (terminus.driving_log) ─▶ engineon (04:00)           ──────▶ analytics.raw_engineon   │
                                                          └────▶ analytics.summary_engineon ┘
terminus.driving_log ────────────────────────────────────────────────────────────────────────▶ /fueldetection (อ่านตรง)
analytics.smartdistance / raw_smartdistance (ETL ภายนอก) ───────────────────────────────────▶ /smartdistance
analytics.overspeed (ETL ภายนอก) ───────────────────────────────────────────────────────────▶ /overspeed
analytics.fuel_drop_reviews (คนรีวิวเขียนเอง) ──────────────────────────────────────────────▶ /dashboard
```

- **3 Mongo databases**: `analytics` (ผลคำนวณ), `atms` (master data + ตั๋ว), `terminus` (GPS ดิบ) — DigitalOcean cluster เดียวกัน
- **MySQL** (`mn-terminus-api`): ใช้เฉพาะ `/api/mixer-compensation` (`mixer_compensation_v2`) และ `/api/rmc-trip` (`rmcconcretetrip`)
- ETL ทั้งหมดรันเป็น subprocess บน **api-ncac** (Render) — auth ด้วย `x-api-key`, log ทุก run ลง `analytics.etl_jobs`

## 2. Daily Cron (ตื่นเองทุกวัน — เวลาไทย)

| เวลา (BKK) | UTC | Pipeline | ทำอะไร |
|---|---|---|---|
| 04:00 | 21:00 | `engineon` | อ่าน GPS เมื่อวาน → หา event "จอดรถ+เครื่องติด" → `raw_engineon` + `summary_engineon` |
| 06:10 | 23:10 | `drivercost_ticket` | โหลดไฟล์ monthly-driver-cost จาก ATMS (regen ~05:00) → rebuild `driver_cost_ticket` เดือนปัจจุบัน |
| 06:30 | 23:30 | `engineon_trip_summary` | join ตั๋ว × engine-on → rebuild `engineon_trip_summary` เดือนปัจจุบัน |

- Scheduler ของ api-ncac **รันเป็น UTC จริง** (พารามิเตอร์ timezone ไม่มีผล) — จำไว้เวลาแก้ตาราง
- "เดือนปัจจุบัน" = เดือนของ**เมื่อวาน** (เวลาไทย) → รันวันที่ 1 ยังปิดยอดเดือนก่อนให้อัตโนมัติ
- สั่งรันมือ/ย้อนหลัง: `POST /pipeline/run/{type}` + body `{"year":2026,"month":7}` (ผ่านหน้า `/pipeline` หรือ curl พร้อม `x-api-key`)
- `vehiclemaster` ไม่มี cron — กดรันมือจากหน้า `/pipeline` (login ATMS อัตโนมัติ ไม่ต้องใช้ PHPSESSID แล้ว)

## 3. Engine-On (โมดูลหลัก)

### 3.1 ตรวจจับ engine-on จาก GPS (`pipeline_engineon.py`)

- อ่าน `terminus.driving_log` รายวัน (field ไทย: วันที่ DD/MM/YYYY, เวลา, Voltage, สถานะ, สถานที่, พิกัด)
- **version_type**: Voltage = "เฟิร์มแวร์ไม่รองรับ" → `v1`, เป็นตัวเลข → `v2`
- **engine state**: สถานะ = "จอดรถ" และ Voltage ≥ **25.0V** → "Parking - Engine On"
- นับช่วงต่อเนื่อง: จุดติดกัน (ห่าง ≤ **5 นาที**, สถานที่เดิม) รวมเป็น event; ขยับเกิน **200 ม.** ตัด event ใหม่
- แต่ละ event หา **โรงงานที่ใกล้สุดในรัศมี 200 ม.** (`atms.plants`) → แยกนาทีเป็น "ใน plant" กับ "นอก plant (not_plant)"
- ผลลัพธ์: `raw_engineon` (`_id = plate_date_eventId`) + `summary_engineon` (`_id = plate_date`, มี `total_engine_on_min` และ `_not_plant`)

### 3.2 ตั๋วรายวัน (`pipeline_drivercost_ticket.py`)

- โหลด Excel batch-report "monthly-driver-cost" จาก ATMS CMS (login อัตโนมัติด้วย `ATMS_USERNAME/PASSWORD`)
- กรองเฉพาะบริการ **Mixer** 13 ประเภท (CPAC, นครหลวง, ORC, ACON, KPAC, เอเชีย ฯลฯ)
- group by (ออก LDT, เลขรถ, หัว, พจส1) → `LDT_unique_count` = จำนวนเที่ยว/คน/คัน/วัน
- เขียนแบบ **delete + insert ทั้งเดือน** ลง `atms.driver_cost_ticket` (key `mmyy = "MM/YYYY"`)

### 3.3 Trip Summary (`pipeline_engineon_trip_summary.py`) — หัวใจของ `/engineon`

- **Outer join** ตั๋ว (หัว+วัน) × engine-on (ทะเบียน+วัน) — ทะเบียนถูก strip "สบ." ก่อนเทียบ
- **การระบุคนขับ (BA rule)** — field `driver_source`:
  1. มีชื่อในตั๋ววันนั้น → `ระบุตามชื่อตั๋วในวัน`
  2. ไม่มีชื่อ แต่คนขับหลักของคันนั้นทั้งเดือนถือ ≥ **70%** ของเที่ยว → `ระบุตามชื่อตั๋วที่มีมากที่สุดในเดือน`
  3. มีหลายคนขับ ไม่ถึง 70% → `อาจมีคนขับมากกว่า 1 ในเดือนจึงไม่ได้สามารถระบุได้` (Supervisor = null)
  4. ไม่มีตั๋วเลยทั้งเดือน → `ไม่มีข้อมูลจึงไม่ได้สามารถระบุได้` (Supervisor = null)
  - แถวที่ระบุคนขับไม่ได้**ยังคงเก็บจำนวนเที่ยวไว้** (groupby ใช้ `dropna=False` — แก้บั๊กเดิมที่เที่ยวหายทั้งแถว)
- **สูตรน้ำมัน (ในเขต plant)**:
  - `สำรองเวลาโหลด = #trip × 30 นาที`
  - `ส่วนต่าง = TotalMinutes − สำรองเวลาโหลด` (ติดลบตัดเป็น 0)
  - `จำนวนลิตร = อัตรา × (ส่วนต่าง/60)` โดยอัตรา: **Mixer 10 ล้อ = 2.0 L/ชม., Mixer 6 ล้อ = 1.0 L/ชม.** (จาก `vehiclemaster.ประเภทยานพาหนะ`; ไม่รู้ประเภท = 0)
  - ไม่มีตั๋ว → `#trip = 0` → เวลา engine-on ทั้งหมดนับเป็นส่วนต่างเต็ม ๆ
- **นอก plant**: `not_plant_liter = อัตรา × (not_plant_minutes/60)` — ไม่มีการหักสำรองเวลา
- `_id = plate_YYYY-MM-DD`; ถ้าคัน+วันเดียวกันมีหลายแถว (เช่น 2 คนขับ) เติม `_d1, _d2, …` (frontend strip suffix นี้ก่อนเปิดแผนที่)
- เขียนแบบ **delete ทั้งเดือนก่อน upsert** — ไม่มีแถวเก่าค้าง

### 3.4 หน้า `/engineon`

- อ่าน `/api/engineon/summary` → filter เดือน/ปีปัจจุบัน (default), ค้นหาทะเบียน/คนขับ, sort, แบ่งหน้า, export Excel
- ไฮไลต์: `จำนวนลิตร > 2` → 🔥 แดง, `not_plant_liter > 2` → ⚠️, `ส่วนต่าง > 0` → แดง
- ปุ่ม 🗺️ → `/engineon/{_id}` → `/api/raw-engineon` regex หา event ทั้งวัน (strip `_dN` ก่อน) → แผนที่ event
- `/api/engineon/summary_fuel`: มุมมองเดียวกันแบบ rename (พจส, TruckNo) สำหรับ export/รายงาน

## 4. โมดูลอื่น ๆ

### 4.1 Fuel Detection (`/fueldetection`)
- กราฟระดับน้ำมันราย จุด GPS จาก `terminus.driving_log` — คนดูเลือกช่วงบนกราฟเอง **ไม่มี threshold อัตโนมัติ**
- ทะเบียนที่เลือกได้ = เฉพาะ**กลุ่มเสี่ยง** (`atms.drivers_risk` ที่จัดการในหน้า `/drivers`)
- บันทึกรีวิวลง `analytics.fuel_drop_reviews`: `fuel_diff = น้ำมันต้น − น้ำมันปลาย` (บวก = หาย), decision 4 แบบ (`reviewed_ok / reviewed_suspicious / false_positive / need_follow_up`), decision "suspicious" **บังคับใส่ note**
- เวลาไทย → UTC โดยลบ 7 ชม. (`src/lib/dt-th.ts`); `start_ts/end_ts` (epoch ms) คือ source of truth
- วันที่ใน driving_log เป็น string DD/MM/YYYY → query ด้วย `$in` รายวัน (กันปีปนกัน) และ sort ในโค้ด

### 4.2 Dashboard (`/dashboard`)
- สรุปงานรีวิว Fuel Detection จาก `fuel_drop_reviews`: KPI (จำนวนรีวิว, จำนวน suspicious, ผลรวม fuel_diff ของ suspicious, วันตั้งแต่ action ล่าสุด), โดนัท decision, heatmap ปฏิทิน (ระดับสี: 0/≤2/≤5/≤10/>10 รีวิวต่อวัน)

### 4.3 Smart Distance (`/smartdistance`)
- เทียบระยะทาง 3 แหล่งต่อตั๋ว: **RMC (ตั๋ว) vs GPS (driving_log) vs OSRM (map API)** ทั้งขาไป (P2S) / ขากลับ (S2P) จาก `analytics.smartdistance`
- บริษัทดูจาก prefix ของ PlantCode: `SU/SX` → Asia, `C` → SCCO
- `is_split_trip = true` → แถวแดง; export Excel ได้
- คลิกตั๋ว → replay เส้นทางบนแผนที่จาก `analytics.raw_smartdistance` (แบ่งขาไป/กลับที่จุดกึ่งกลาง array — เป็นค่าประมาณ), วงกลม plant/site รัศมี 200 ม.

### 4.4 Over-Speed (`/overspeed`)
- อ่าน `analytics.overspeed` (คำนวณโดย ETL ภายนอก — แอปไม่ได้คิด threshold เอง): ช่วงเวลา, ระยะทาง, avg/max/weighted speed, `speed_group`
- API เติมเวลาไทย (+7) และ export Excel หัวตารางไทย; ปีแสดงเป็น พ.ศ.

### 4.5 Drivers — กลุ่มเสี่ยง (`/drivers`)
- จัดการ `atms.drivers_risk` รายเดือน: วางรายชื่อ (regex จับ "คำไทย เว้นวรรค คำไทย") → ระบบหา**ทุกทะเบียน (หัว)** ที่คนนั้นขับในเดือนนั้นจาก `driver_cost_ticket` → insert 1 แถว/ทะเบียน
- รายชื่อนี้คือตัวกำหนดว่า Fuel Detection วิเคราะห์คันไหนได้

### 4.6 Plants / Master Data (`/plants`)
- CRUD `atms.plants` (client, plant_code, lat/lng) — **จุดสำคัญ: engineon ETL ใช้พิกัดนี้แยก "ใน/นอก plant"** เพิ่มโรงงานใหม่แล้วผล engine-on เปลี่ยน
- endpoint ประกอบ (ไม่มีหน้า UI): `/api/zone` (`zone_master`), `/api/shipto` (`shipto`), `/api/vehiclemaster`, `/api/vehicle-daily`, `/api/processed_ldf`, `/api/rmc-trip` (MySQL), `/api/mixer-compensation` (MySQL)

### 4.7 Pipeline (`/pipeline`)
- ปุ่ม Run 4 ตัว → proxy `/api/pipeline/[type]` (ฝั่ง server ถือ `PIPELINE_API_KEY`) → api-ncac `/pipeline/run/{type}`
- สถานะ: poll `/pipeline/status/{type}` เทียบ `etl_jobs.created_at` กับเวลากดรัน (เผื่อ clock skew 60 วิ; ถ้า 60 วิแล้ว job log ไม่ขึ้น = fail)
- ปุ่ม 📄 ETL Jobs → `analytics.etl_jobs` 50 รายการล่าสุด

## 5. Convention กลางของระบบ

1. **รูปแบบวันที่ 2 แบบอยู่ร่วมกัน**: string ไทย `DD/MM/YYYY` (driving_log, processed_ldf → ต้อง query แบบ `$in` รายวัน) vs `Date`/epoch จริง (overspeed, fuel_drop_reviews → range query ได้) vs string ISO (smartdistance → prefix regex)
2. **เวลาไทย = UTC+7** แปลงคนละที่คนละวิธี (dt-th.ts ลบ 7 / overspeed API บวก 7 / ตาราง overspeed ลบ 7 อีกรอบ) — ระวังเวลาแก้
3. **พ.ศ. (+543)** ใช้แสดงผลใน SmartDistance, Overspeed, heatmap Dashboard
4. ทะเบียนรถ: strip prefix "สบ." ก่อน join เสมอ
5. ETL log กลาง: `analytics.etl_jobs` (มีทั้ง `job_type` สำหรับ UI นี้ และ `pipeline`/`created_at` สำหรับ api-ncac)

## 6. Known Issues (ควรแก้)

| ที่ | ปัญหา |
|---|---|
| `/api/drivers` PUT/DELETE | ยิงไปที่ `atms.plants` แทน `drivers_risk` (copy-paste bug) — ปุ่มลบในหน้า Drivers จึงลบผิด collection |
| หน้า Drivers | ปีถูก hard-code [2025, 2026] (พังปี 2027), pagination แสดงเลขหน้าแต่ตารางโชว์ทุกแถว |
| หน้าแรก | การ์ด "Master Data" ลิงก์ไป `/masterdata` ซึ่งไม่มีจริง (ของจริงคือ `/plants`) |
| `/api/fuel-reviews` GET | หน้าเว็บส่ง startDate/endDate แต่ API อ่านเฉพาะ startTs/endTs — filter วันที่ไม่ทำงาน (กรองแค่ plate) |
| Overspeed | เวลาแปลง +7/−7 ซ้อนกันระหว่าง API กับตาราง — แสดงผลถูกโดยบังเอิญ ถ้าแก้ฝั่งเดียวจะเพี้ยน |
| driver_cost (payroll, คนละตัวกับ drivercost_ticket) | cron บน api-ncac fail เงียบทุกวันตั้งแต่ 14 ก.ค. — `mena-bi.driverCost` ไม่อัปเดต ควรดู Render logs |

## 7. Deploy & Env

| ที่ | Env ที่ต้องมี |
|---|---|
| Vercel (fuel-control-center) | `MONGO_URI`, `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` (MySQL), `PIPELINE_API_KEY`, (`NCAC_API_BASE` ถ้า URL เปลี่ยน) |
| Render (api-ncac) | `MONGODB_URI`, `ATMS_USERNAME`, `ATMS_PASSWORD`, `PIPELINE_API_KEY` (+ ของ pipeline อื่นเดิม) |

- Repo: `nrk16p/fuel-control-center` (frontend), `nrk16p/api-ncac` (ETL) — push = deploy อัตโนมัติ
- `nrk16p/api-engineon` (Render เก่า): ยังเปิดไว้เป็น fallback ระยะ parallel — ปลดได้เมื่อ cron ใหม่นิ่ง
