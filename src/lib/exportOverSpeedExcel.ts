import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import type { Overspeed } from "@/components/overspeed/types"

export function exportOverSpeedExcel (
  rows: Overspeed[],
  filename = "Overspeed-summary.xlsx"
) {
  if (!rows || rows.length === 0) return

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "-"
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return "-"
    dt.setHours(dt.getHours() - 7)

    const day = dt.getDate().toString().padStart(2, "0")
    const month = (dt.getMonth() + 1).toString() 
    const year = dt.getFullYear() + 543
    const hours = dt.getHours().toString().padStart(2, "0")
    const minutes = dt.getMinutes().toString().padStart(2, "0")

    return `${day}/${month}/${year}, ${hours}:${minutes}`
  }

  const data = rows.map((r) => ({
    ปี:r.year,
    เดือน:r.month,
    ทะเบียน: r.vehicle,
    วันที่เริ่มต้น: formatDate(r.start_datetime),
    วันที่สิ้นสุด: formatDate(r.end_datetime),
    "ระยะเวลา (นาที)": r.duration_minutes,
    "ระยะทางรวม (กม.)": r.sum_distance_km,
    "ความเร็วเฉลี่ย": r.avg_speed,
    "ความเร็วสูงสุด": r.max_speed,
    "ความเร็วที่ตรวจจับ": r.w_speed,
    "กลุ่มความเร็ว": r.speed_group
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(workbook, worksheet, "Over-Speed")

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
