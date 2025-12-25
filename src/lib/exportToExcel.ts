import * as XLSX from "xlsx"

/**
 * Generic Excel export helper
 * @param rows array of objects
 * @param filename output file name
 */
export function exportToExcel<T extends Record<string, any>>(
  rows: T[],
  filename: string
) {
  if (!rows || rows.length === 0) return

  // convert to worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows)

  // create workbook
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data")

  // export file
  XLSX.writeFile(workbook, filename)
}
