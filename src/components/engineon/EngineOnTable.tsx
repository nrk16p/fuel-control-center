"use client"

import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { MapPin } from "lucide-react"

export interface EngineData {
  _id: string
  date: string
  total_engine_on_hr: number
  total_engine_on_min: number
  version_type: string
  ["ทะเบียนพาหนะ"]: string
}

export function EngineOnTable({ data }: { data: EngineData[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState<number>(50)

  // 🔎 Filter data by search
  const filteredData = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((d) => d["ทะเบียนพาหนะ"]?.toLowerCase().includes(q))
  }, [data, search])

  // 📄 Pagination logic
  const total = filteredData.length
  const effectivePageSize = pageSize === 0 ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const safePage = Math.min(page, totalPages)

  const paginatedData =
    pageSize === 0
      ? filteredData
      : filteredData.slice(
          (safePage - 1) * effectivePageSize,
          safePage * effectivePageSize
        )

  React.useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  // 🧱 Table columns
  const columns = React.useMemo<ColumnDef<EngineData>[]>(() => [
    { header: "ทะเบียนพาหนะ", accessorKey: "ทะเบียนพาหนะ" },
    { header: "วันที่", accessorKey: "date" },
    {
      header: "Engine–On (ชม.)",
      accessorKey: "total_engine_on_hr",
      cell: ({ getValue }) => (Number(getValue()) || 0).toFixed(2),
    },
    {
      header: "Engine–On (นาที)",
      accessorKey: "total_engine_on_min",
      cell: ({ getValue }) => (Number(getValue()) || 0).toFixed(2),
    },
    { header: "Version", accessorKey: "version_type" },
    {
      header: "Action",
      cell: ({ row }) => {
        const id = row.original._id
        return (
          <a
            href={`/engineon/${id}`}
            className="inline-flex items-center justify-center w-8 h-8 text-blue-600 hover:text-blue-800 transition"
            title="ดูแผนที่"
          >
            <MapPin className="w-5 h-5" />
          </a>
        )
      },
    },
  ], [])

  const table = useReactTable({
    data: paginatedData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // 📤 Export filtered data to Excel
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "EngineOn")
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(
      new Blob([buf], { type: "application/octet-stream" }),
      `EngineOn_${new Date().toISOString().slice(0, 10)}.xlsx`
    )
  }

  return (
    <div className="space-y-4">
      {/* 🔍 Top controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Input
          placeholder="🔍 ค้นหาทะเบียนพาหนะ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Button onClick={handleExport}>📥 Export Excel</Button>
      </div>

      {/* 📊 Data table */}
      <div className="rounded-md border bg-white overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="border px-4 py-2 text-left cursor-pointer select-none text-gray-700"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc"
                      ? " 🔼"
                      : h.column.getIsSorted() === "desc"
                      ? " 🔽"
                      : null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border px-4 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center py-6 text-gray-500"
                >
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 📍 Footer Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm py-3 border-t bg-gray-50 px-4">
          <span>
            แสดง {paginatedData.length} จาก {total} รายการ
          </span>

          <div className="flex items-center gap-3">
            <label className="text-gray-600">แถวต่อหน้า:</label>
            <select
              className="border rounded px-2 py-1 bg-white"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value={0}>ทั้งหมด</option>
            </select>

            {/* 📄 Pagination controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1 || pageSize === 0}
                onClick={() => setPage(1)}
              >
                ⏮️ หน้าแรก
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1 || pageSize === 0}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ◀️ ก่อนหน้า
              </Button>

              <span className="text-gray-700 font-medium">
                หน้า {safePage} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={pageSize === 0 || safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ถัดไป ▶️
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pageSize === 0 || safePage >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                หน้าสุดท้าย ⏭️
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
