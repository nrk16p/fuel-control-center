"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface EngineonSummary {
  _id: string
  ทะเบียนพาหนะ: string
  date: string
  total_engine_on_hr: number
  total_engine_on_min: number
  count_records: number
  nearest_plant?: string
}

export default function DashboardPage() {
  const [rawData, setRawData] = useState<EngineonSummary[]>([])
  const [loading, setLoading] = useState(true)

  /* ---------------- Filters ---------------- */
  const [selectedPlate, setSelectedPlate] = useState<string>("ALL")
  const [minHours, setMinHours] = useState<number>(0)
  const [highIdleOnly, setHighIdleOnly] = useState(false)

  /* ---------------- Fetch ---------------- */
  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("/api/engineon")
      const json = await res.json()
      setRawData(json)
      setLoading(false)
    }
    fetchData()
  }, [])

  /* ---------------- Vehicle List ---------------- */
  const vehicleList = useMemo(() => {
    return Array.from(
      new Set(rawData.map((d) => d["ทะเบียนพาหนะ"]))
    ).sort()
  }, [rawData])

  /* ---------------- Apply Filters ---------------- */
  const filteredData = useMemo(() => {
    return rawData.filter((d) => {
      if (selectedPlate !== "ALL" && d["ทะเบียนพาหนะ"] !== selectedPlate)
        return false
      if (d.total_engine_on_hr < minHours) return false
      return true
    })
  }, [rawData, selectedPlate, minHours])

  /* ---------------- Group by Vehicle ---------------- */
  const vehicleSummary = useMemo(() => {
    const map: any = {}
    filteredData.forEach((d) => {
      if (!map[d["ทะเบียนพาหนะ"]]) {
        map[d["ทะเบียนพาหนะ"]] = {
          plate: d["ทะเบียนพาหนะ"],
          total_hours: 0,
          total_minutes: 0,
          records: 0,
          plant: d.nearest_plant,
        }
      }
      map[d["ทะเบียนพาหนะ"]].total_hours += d.total_engine_on_hr
      map[d["ทะเบียนพาหนะ"]].total_minutes += d.total_engine_on_min
      map[d["ทะเบียนพาหนะ"]].records += d.count_records
    })
    return Object.values(map)
  }, [filteredData])

  const avgHours =
    vehicleSummary.reduce((s: number, v: any) => s + v.total_hours, 0) /
    (vehicleSummary.length || 1)

  const finalVehicles = highIdleOnly
    ? vehicleSummary.filter((v: any) => v.total_hours > avgHours * 1.5)
    : vehicleSummary

  /* ---------------- Daily Trend ---------------- */
  const dailyTrend = useMemo(() => {
    const map: Record<string, number> = {}
    filteredData.forEach((d) => {
      map[d.date] = (map[d.date] || 0) + d.total_engine_on_hr
    })
    return Object.entries(map)
      .map(([date, hours]) => ({ date, hours }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredData])

  if (loading)
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="animate-spin mr-2" /> Loading...
      </div>
    )

  /* ---------------- UI ---------------- */
  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">🚛 Engine-On Dashboard</h1>

      {/* ---------------- FILTER BAR ---------------- */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Plate */}
          <div>
            <label className="text-sm text-gray-500">Vehicle</label>
            <select
              className="w-full border rounded px-2 py-1"
              value={selectedPlate}
              onChange={(e) => setSelectedPlate(e.target.value)}
            >
              <option value="ALL">All</option>
              {vehicleList.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Min Hours */}
          <div>
            <label className="text-sm text-gray-500">
              Min Engine-On (hr)
            </label>
            <input
              type="number"
              className="w-full border rounded px-2 py-1"
              value={minHours}
              onChange={(e) => setMinHours(Number(e.target.value))}
            />
          </div>

          {/* High Idle */}
          <div className="flex items-end gap-2">
            <input
              type="checkbox"
              checked={highIdleOnly}
              onChange={(e) => setHighIdleOnly(e.target.checked)}
            />
            <label className="text-sm">⚠️ High-Idle Only</label>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- BAR ---------------- */}
      <Card>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={finalVehicles.slice(0, 15)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="plate"
                angle={-45}
                textAnchor="end"
                height={70}
              />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total_hours" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ---------------- TREND ---------------- */}
      <Card>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line dataKey="hours" stroke="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </main>
  )
}
