"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Search, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import * as XLSX from "xlsx"

interface EngineData {
  _id: string
  date: string // assumed format: "DD/MM/YYYY" or ISO
  total_engine_on_hr: number
  total_engine_on_min: number
  version_type: string
  ทะเบียนพาหนะ: string
}

export default function EngineOnPage() {
  const [data, setData] = useState<EngineData[]>([])
  const [filtered, setFiltered] = useState<EngineData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("/api/engineon")
      const json = await res.json()
      setData(json)
      setFiltered(json)
      setLoading(false)
    }
    fetchData()
  }, [])

  // 🔎 Filter by search + date range
  useEffect(() => {
    let temp = [...data]
    const lower = search.toLowerCase()

    // Filter by text
    if (search.trim()) {
      temp = temp.filter(
        (d) =>
          d["ทะเบียนพาหนะ"].toLowerCase().includes(lower) ||
          d.date.includes(lower)
      )
    }

    // Filter by date range (if both start/end exist)
    if (startDate || endDate) {
      temp = temp.filter((item) => {
        const [day, month, year] = item.date.split(/[/-]/).map(Number)
        const itemDate = new Date(year, month - 1, day).getTime()
        const start = startDate ? new Date(startDate).getTime() : -Infinity
        const end = endDate ? new Date(endDate).getTime() : Infinity
        return itemDate >= start && itemDate <= end
      })
    }

    setFiltered(temp)
    setPage(1)
  }, [search, data, startDate, endDate])

  // 📊 Summary
  const totalVehicles = useMemo(() => {
    const unique = new Set(filtered.map((d) => d["ทะเบียนพาหนะ"]))
    return unique.size
  }, [filtered])

  const totalHours = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.total_engine_on_hr || 0), 0),
    [filtered]
  )
  const avgHours = useMemo(
    () => (totalHours / (filtered.length || 1)).toFixed(2),
    [totalHours, filtered]
  )
  const maxHour = useMemo(
    () =>
      filtered.length > 0
        ? Math.max(...filtered.map((r) => r.total_engine_on_hr || 0)).toFixed(2)
        : "0.00",
    [filtered]
  )

  // 📤 Export to Excel
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filtered)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "EngineOn")
    XLSX.writeFile(wb, "EngineOnData.xlsx")
  }

  // 📄 Pagination
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  )

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">🛠️ Engine-On Detection</h1>
      <p className="text-gray-600">
        Monitor engine-on durations from GPS logs in real time.
      </p>

      {/* 📈 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="ทะเบียนรถทั้งหมด (Unique)" value={totalVehicles} icon="🚚" color="bg-emerald-100" />
        <SummaryCard label="รวมเวลาทำงาน (ชม.)" value={totalHours.toFixed(2)} icon="⏱️" color="bg-cyan-100" />
        <SummaryCard label="เฉลี่ย (ชม./คัน)" value={avgHours} icon="📊" color="bg-yellow-100" />
        <SummaryCard label="สูงสุด (ชม.)" value={maxHour} icon="⚠️" color="bg-rose-100" />
      </div>

      {/* 🔍 Filters */}
      <div className="flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-sm border gap-3">
        {/* Left side: search + date range */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Search className="text-gray-500" size={18} />
            <Input
              placeholder="ค้นหาทะเบียนพาหนะหรือวันที่..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="text-gray-500" size={18} />
            <label className="text-gray-600 text-sm">จาก</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
            <label className="text-gray-600 text-sm">ถึง</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
        </div>

        {/* Right side: export */}
        <Button
          onClick={handleExport}
          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
        >
          <Download size={18} /> Export Excel
        </Button>
      </div>

      {/* 📋 Table */}
      {loading ? (
        <p className="text-gray-500 mt-6">Loading data...</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
          <table className="min-w-full text-sm text-gray-700">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left">ทะเบียนพาหนะ</th>
                <th className="p-3 text-left">วันที่</th>
                <th className="p-3 text-left">Engine-On (ชม.)</th>
                <th className="p-3 text-left">Engine-On (นาที)</th>
                <th className="p-3 text-left">Version</th>
                <th className="p-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((item, idx) => (
                <tr key={idx} className="border-t hover:bg-gray-50 transition">
                  <td className="p-3">{item["ทะเบียนพาหนะ"]}</td>
                  <td className="p-3">{item.date}</td>
                  <td className="p-3">{item.total_engine_on_hr?.toFixed(2)}</td>
                  <td className="p-3">{item.total_engine_on_min?.toFixed(2)}</td>
                  <td className="p-3">{item.version_type}</td>
                  <td className="p-3 text-center">
                    <a
                      href={`/engineon/${item._id}`}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 text-lg transition"
                      title="ดูแผนที่"
                    >
                      🗺️
                    </a>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-gray-500">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 📄 Pagination Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm py-3 border-t bg-gray-50 px-4">
            <span>
              แสดง {paginated.length} จาก {total} รายการ
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

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                >
                  ⏮️ หน้าแรก
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
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
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ถัดไป ▶️
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  หน้าสุดท้าย ⏭️
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 🧩 Summary Card
function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string | number
  icon: string
  color: string
}) {
  return (
    <div className={`rounded-xl p-5 ${color} bg-opacity-70 shadow-sm`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <div className="text-gray-800 font-bold text-xl">{value}</div>
          <div className="text-gray-600 text-sm">{label}</div>
        </div>
      </div>
    </div>
  )
}
