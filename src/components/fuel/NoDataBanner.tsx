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
