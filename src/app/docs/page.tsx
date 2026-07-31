/* /docs — How this system really works (data pipeline + logic summary)
   Static page, no data fetching. Full reference: docs/LOGIC.md in the repo. */

export const metadata = {
  title: "System Docs — Fuel Control Center",
}

/* ---------- small building blocks ---------- */

function Box({
  title,
  lines,
  tone = "gray",
}: {
  title: string
  lines: string[]
  tone?: "gray" | "blue" | "amber" | "green" | "purple"
}) {
  const tones: Record<string, string> = {
    gray: "border-gray-300 bg-white",
    blue: "border-blue-300 bg-blue-50",
    amber: "border-amber-300 bg-amber-50",
    green: "border-green-300 bg-green-50",
    purple: "border-purple-300 bg-purple-50",
  }
  return (
    <div className={`rounded-lg border ${tones[tone]} px-3 py-2 shadow-sm`}>
      <div className="text-sm font-semibold">{title}</div>
      {lines.map((l) => (
        <div key={l} className="text-xs text-gray-600 leading-5">
          {l}
        </div>
      ))}
    </div>
  )
}

function Arrow() {
  return <div className="text-gray-400 text-xl text-center select-none">→</div>
}

function Section({
  emoji,
  title,
  children,
}: {
  emoji: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border rounded-xl shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-bold">
        {emoji} {title}
      </h2>
      {children}
    </section>
  )
}

/* ---------- page ---------- */

export default function DocsPage() {
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">📖 ระบบนี้ทำงานยังไง</h1>
        <p className="text-sm text-gray-600">
          สรุป data pipeline + business logic ของ Fuel Control Center ทั้งระบบ —
          ฉบับเต็มดูที่ <code className="bg-gray-100 px-1 rounded">docs/LOGIC.md</code> ใน repo
        </p>
      </header>

      {/* 1. Big picture flow */}
      <Section emoji="🗺️" title="ภาพรวม: ข้อมูลไหลจากไหนไปไหน">
        <div className="overflow-x-auto">
          <div className="min-w-[880px] grid grid-cols-[1fr_28px_1fr_28px_1fr_28px_1fr] gap-2 items-center">
            {/* column headers */}
            <div className="text-xs font-bold text-gray-500 uppercase">แหล่งข้อมูล</div>
            <div />
            <div className="text-xs font-bold text-gray-500 uppercase">
              ETL — api-ncac (Render)
            </div>
            <div />
            <div className="text-xs font-bold text-gray-500 uppercase">MongoDB</div>
            <div />
            <div className="text-xs font-bold text-gray-500 uppercase">หน้าจอ</div>

            {/* row 1: GPS → engineon */}
            <Box
              tone="amber"
              title="🛰️ GPS รายวินาที"
              lines={["terminus.driving_log", "วันที่ / Voltage / สถานะ / พิกัด"]}
            />
            <Arrow />
            <Box
              tone="blue"
              title="engineon — 04:00 น."
              lines={["จอดรถ + Voltage ≥ 25V", "= เครื่องติดขณะจอด", "ตัด event ทุก 200 ม. / 5 นาที"]}
            />
            <Arrow />
            <Box
              title="raw_engineon + summary_engineon"
              lines={["นาที engine-on ต่อคัน/วัน", "แยกใน plant / นอก plant (200 ม.)"]}
            />
            <Arrow />
            <Box tone="green" title="🔥 /engineon" lines={["ตารางลิตรน้ำมันส่วนเกิน + แผนที่ event"]} />

            {/* row 2: ATMS → drivercost_ticket */}
            <Box
              tone="amber"
              title="🌐 ATMS (mena-atms.com)"
              lines={["ไฟล์ monthly-driver-cost", "regen ~05:00 น. ทุกวัน"]}
            />
            <Arrow />
            <Box
              tone="blue"
              title="drivercost_ticket — 06:10 น."
              lines={["login อัตโนมัติ → โหลด Excel", "เฉพาะบริการ Mixer 13 ประเภท", "นับเที่ยวต่อ คน/คัน/วัน"]}
            />
            <Arrow />
            <Box
              title="atms.driver_cost_ticket"
              lines={["#เที่ยว (LDT) ต่อ หัว+พจส.+วัน", "rebuild ทั้งเดือนทุกเช้า"]}
            />
            <Arrow />
            <div className="row-span-1">
              <Box
                tone="purple"
                title="engineon_trip_summary — 06:30 น."
                lines={["join ตั๋ว × engine-on", "→ analytics.engineon_trip_summary"]}
              />
            </div>

            {/* row 3: direct reads */}
            <Box
              tone="amber"
              title="📦 ผลคำนวณจาก ETL ภายนอก"
              lines={["analytics.smartdistance", "analytics.overspeed"]}
            />
            <Arrow />
            <Box tone="blue" title="(ไม่ผ่าน api-ncac)" lines={["คำนวณมาก่อนแล้ว แอปอ่านอย่างเดียว"]} />
            <Arrow />
            <Box title="analytics.*" lines={["smartdistance / raw_smartdistance", "overspeed"]} />
            <Arrow />
            <Box tone="green" title="🗺️ /smartdistance · 🚨 /overspeed" lines={["เทียบระยะ 3 แหล่ง · ช่วงขับเร็วเกิน"]} />

            {/* row 4: fuel detection manual */}
            <Box tone="amber" title="🛰️ GPS (อ่านตรง)" lines={["terminus.driving_log", "ระดับน้ำมันรายจุด"]} />
            <Arrow />
            <Box tone="blue" title="👀 คนรีวิวเลือกช่วงเอง" lines={["ไม่มี threshold อัตโนมัติ", "เฉพาะทะเบียนกลุ่มเสี่ยง (/drivers)"]} />
            <Arrow />
            <Box title="analytics.fuel_drop_reviews" lines={["fuel_diff + decision + note"]} />
            <Arrow />
            <Box tone="green" title="⛽ /fueldetection · 📊 /dashboard" lines={["กราฟรีวิว · KPI + heatmap"]} />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          ETL ทุกตัวเขียน log ลง <code>analytics.etl_jobs</code> — ดูได้ที่ปุ่ม 📄 ETL Jobs ในหน้า /pipeline
          · สั่งรันมือ/ย้อนหลังได้จากหน้า /pipeline (ส่ง year/month ได้)
        </p>
      </Section>

      {/* 2. Cron timeline */}
      <Section emoji="⏰" title="ตารางเวลาอัตโนมัติทุกเช้า (เวลาไทย)">
        <div className="flex flex-col md:flex-row gap-3">
          {[
            ["04:00", "engineon", "คำนวณ engine-on ของเมื่อวานจาก GPS", "🔵"],
            ["06:10", "drivercost_ticket", "โหลดตั๋วจาก ATMS (หลังไฟล์ regen ~05:00)", "🟡"],
            ["06:30", "engineon_trip_summary", "join แล้ว rebuild ทั้งเดือน → หน้า /engineon สดใหม่", "🟣"],
          ].map(([t, name, desc, dot]) => (
            <div key={name} className="flex-1 border rounded-lg p-4 bg-gray-50">
              <div className="text-xl font-bold">
                {dot} {t}
              </div>
              <div className="font-mono text-sm text-blue-700">{name}</div>
              <div className="text-xs text-gray-600 mt-1">{desc}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          รันวันที่ 1 ของเดือน = ปิดยอด &quot;เดือนของเมื่อวาน&quot; ให้อัตโนมัติ · scheduler บน Render
          ทำงานเป็น UTC (04:00 ไทย = 21:00 UTC ของวันก่อน)
        </p>
      </Section>

      {/* 3. Core formula */}
      <Section emoji="🧮" title="สูตรคิดลิตรน้ำมัน (หัวใจของ Engine-On)">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 space-y-2 bg-gray-50">
            <div className="font-semibold text-sm">ในเขต plant (รัศมี 200 ม.)</div>
            <div className="font-mono text-sm space-y-1">
              <div>สำรองเวลาโหลด = #เที่ยว × 30 นาที</div>
              <div>ส่วนต่าง = เวลาเครื่องติด − สำรองเวลาโหลด</div>
              <div>จำนวนลิตร = อัตรา × (ส่วนต่าง ÷ 60)</div>
            </div>
            <div className="text-xs text-gray-600">
              อัตรา: Mixer 10 ล้อ = <b>2.0 L/ชม.</b> · Mixer 6 ล้อ = <b>1.0 L/ชม.</b> (จาก vehiclemaster) ·
              ไม่มีตั๋ว → #เที่ยว = 0 → เวลาเครื่องติดนับเต็ม · เกิน 2 ลิตร → 🔥
            </div>
          </div>
          <div className="border rounded-lg p-4 space-y-2 bg-gray-50">
            <div className="font-semibold text-sm">นอกเขต plant</div>
            <div className="font-mono text-sm">not_plant_liter = อัตรา × (นาทีนอก plant ÷ 60)</div>
            <div className="text-xs text-gray-600">
              ไม่หักสำรองเวลาโหลด — เครื่องติดนอกโรงงานนับทุกนาที · เกิน 2 ลิตร → ⚠️
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="font-semibold text-sm mb-2">การระบุคนขับ (driver_source)</div>
          <ol className="text-xs text-gray-700 space-y-1 list-decimal list-inside">
            <li>มีชื่อในตั๋ววันนั้น → <b>ระบุตามชื่อตั๋วในวัน</b></li>
            <li>ไม่มีชื่อ แต่คนขับหลักถือ ≥ 70% ของเที่ยวทั้งเดือน → <b>ระบุตามชื่อตั๋วที่มีมากที่สุดในเดือน</b></li>
            <li>หลายคนขับ ไม่มีใครถึง 70% → ระบุไม่ได้ (แสดง &quot;-&quot; แต่จำนวนเที่ยวยังอยู่)</li>
            <li>ไม่มีตั๋วเลยทั้งเดือน → ไม่มีข้อมูล (เวลาเครื่องติดนับเต็ม)</li>
          </ol>
        </div>
      </Section>

      {/* 4. Modules */}
      <Section emoji="🧩" title="โมดูลทั้งหมด">
        <div className="grid md:grid-cols-2 gap-4">
          {[
            ["🔥 Engine-On", "/engineon", "analytics.engineon_trip_summary", "ลิตรน้ำมันส่วนเกินต่อคัน/วัน + แผนที่ event · filter เดือน/ปี · export Excel"],
            ["⛽ Fuel Detection", "/fueldetection", "terminus.driving_log + analytics.fuel_drop_reviews", "กราฟระดับน้ำมัน เลือกช่วงรีวิวเอง · decision 4 แบบ (suspicious บังคับใส่ note) · เฉพาะทะเบียนกลุ่มเสี่ยง"],
            ["📊 Dashboard", "/dashboard", "analytics.fuel_drop_reviews", "KPI งานรีวิว + โดนัท decision + heatmap ปฏิทิน (0/≤2/≤5/≤10/>10 รีวิวต่อวัน)"],
            ["🗺️ Smart Distance", "/smartdistance", "analytics.smartdistance + raw_smartdistance", "เทียบระยะตั๋ว (RMC) vs GPS vs OSRM ขาไป/กลับ · replay เส้นทาง · is_split_trip = แถวแดง"],
            ["🚨 Over-Speed", "/overspeed", "analytics.overspeed", "ช่วงขับเร็วเกินต่อคัน (avg/max/weighted speed + speed_group) · export Excel หัวตารางไทย"],
            ["🚚 Drivers (กลุ่มเสี่ยง)", "/drivers", "atms.drivers_risk ← driver_cost_ticket", "วางรายชื่อคนขับ → ระบบหาทุกทะเบียนที่เขาขับในเดือนนั้น → เป็น list ให้ Fuel Detection"],
            ["🏭 Plants", "/plants", "atms.plants", "พิกัดโรงงาน (CRUD) — engineon ใช้แยกใน/นอก plant · เพิ่มโรงงานแล้วผล engine-on เปลี่ยน"],
            ["🔄 Pipeline", "/pipeline", "analytics.etl_jobs", "ปุ่มรัน ETL 4 ตัว (ผ่าน api-ncac + x-api-key) · ดู log งานทุก run"],
          ].map(([name, href, source, desc]) => (
            <a
              key={href}
              href={href}
              className="border rounded-lg p-4 hover:bg-blue-50 transition block space-y-1"
            >
              <div className="font-semibold text-sm">{name}</div>
              <div className="font-mono text-[11px] text-purple-700">{source}</div>
              <div className="text-xs text-gray-600">{desc}</div>
            </a>
          ))}
        </div>
      </Section>

      {/* 5. Conventions */}
      <Section emoji="📐" title="กติกากลางที่ต้องรู้ก่อนแก้โค้ด">
        <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
          <li>
            วันที่มี 3 แบบ: string ไทย <code>DD/MM/YYYY</code> (driving_log → query แบบ $in รายวัน) ·
            Date/epoch จริง (overspeed, fuel_drop_reviews) · string ISO (smartdistance → prefix regex)
          </li>
          <li>เวลาไทย = UTC+7 — แปลงกันคนละชั้น (dt-th.ts / overspeed API / ตาราง overspeed) ระวังแก้ฝั่งเดียวแล้วเพี้ยน</li>
          <li>ปี พ.ศ. (+543) ใช้แสดงผลใน SmartDistance, Overspeed และ heatmap</li>
          <li>ทะเบียนรถ strip คำนำหน้า &quot;สบ.&quot; ก่อน join เสมอ</li>
          <li>
            ETL log กลางอยู่ที่ <code>analytics.etl_jobs</code> · backend ETL คือ repo{" "}
            <code>api-ncac</code> (Render) · frontend คือ repo <code>fuel-control-center</code> (Vercel) —
            push แล้ว deploy อัตโนมัติทั้งคู่
          </li>
        </ul>
      </Section>

      <footer className="text-center text-xs text-gray-400 pb-4">
        อัปเดต 31/07/2026 · รายละเอียดเชิงลึก (สูตร, field, known issues) อยู่ใน docs/LOGIC.md
      </footer>
    </div>
  )
}
