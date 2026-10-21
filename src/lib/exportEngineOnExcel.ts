import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import type { EngineTripSummary } from "@/components/engineon/types"

export function exportEngineOnExcel(
  rows: EngineTripSummary[],
  filename = "engineon-summary.xlsx",
  gpsOf?: (r: EngineTripSummary) => string
) {
  if (!rows || rows.length === 0) return

  // 🔁 map data → column ที่อยาก export
  const data = rows.map((r) => ({
    วันที่: r.Date,
    ทะเบียน: r.TruckPlateNo,
    ...(gpsOf ? { GPS: gpsOf(r) } : {}),
    คนขับ: r.Supervisor ?? "",
    "Engine-On (นาที)": r.TotalMinutes,
    "Engine-On (แสดงผล)": r.Duration_str,
    Trip: r["#trip"],
    ลิตร: r.จำนวนลิตร ?? "",
    Version: r.version_type,
    ปี: r.year,
    เดือน: r.month,
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(workbook, worksheet, "Engine-On")

  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  })

  const blob = new Blob([excelBuffer], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  saveAs(blob, filename)
}
