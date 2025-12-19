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

/* -------------------------------------------------
   Types (MATCH API 100%)
------------------------------------------------- */
interface EngineonSummary {
  _id: string
  TruckPlateNo: string
  Date: string
  total_engine_on_hr: number
  total_engine_on_min: number
  count_records: number
  nearest_plant?: string
}

export default function DashboardPage() {
  const [rawData, setRawData] = useState<EngineonSummary[]>([])
  const [loading, setLoading] = useState(true)

  /* -------------------------------------------------
     Filters
  ------------------------------------------------- */
  const [selectedPlate, setSelectedPlate] = useState<string>("ALL")
  const [minHours, setMinHours] = useState<number>(0)
  const [highIdleOnly, setHighIdleOnly] = useState(false)

  /* -------------------------------------------------
     Fetch Data
  ------------------------------------------------- */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/engineon")
        const json = await res.json()
        console.log("API SAMPLE 👉", json[0])
        setRawData(json)
      } catch (err) {
        console.error("❌ API error", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  /* -------------------------------------------------
     Vehicle List
  ------------------------------------------------- */
  const vehicleList = useMemo(() => {
    return Array.from(
      new Set(rawData.map((d) => d.TruckPlateNo))
    ).sort()
  }, [rawData])

  /* -------------------------------------------------
     Apply Filters
  ------------------------------------------------- */
  const filteredData = useMemo(() => {
    return rawData.filter((d) => {
      if (selectedPlate !== "ALL" && d.TruckPlateNo !== selectedPlate)
        return false
      if (d.total_engine_on_hr < minHours) return false
      return true
    })
  }, [rawData, selectedPlate, minHours])

  /* -------------------------------------------------
     Group by Vehicle
  ------------------------------------------------- */
  const vehicleSummary = useMemo(() => {
    const map: Record<
      string,
      {
        plate: string
        total_hours: number
        total_minutes: number
        records: number
        plant?: string
      }
    > = {}

    filteredData.forEach((d) => {
      const plate = d.TruckPlateNo

      if (!map[plate]) {
        map[plate] = {
          plate,
          total_hours: 0,
          total_minutes: 0,
          records: 0,
          plant: d.nearest_plant,
        }
      }

      map[plate].total_hours += d.total_engine_on_hr
      map[plate].total_minutes += d.total_engine_on_min
      map[plate].records += d.count_records
    })

    return Object.values(map).sort(
      (a, b) => b.total_hours - a.total_hours
    )
  }, [filteredData])

  /* -------------------------------------------------
     KPI Metrics
  ------------------------------------------------- */
  const totalHours = useMemo(
    () => vehicleSummary.reduce((s, v) => s + v.total_hours, 0),
    [vehicleSummary]
  )

  const avgHours =
    vehicleSummary.length > 0
      ? totalHours / vehicleSummary.length
      : 0

  const finalVehicles = highIdleOnly
    ? vehicleSummary.filter((v) => v.total_hours > avgHours * 1.5)
    : vehicleSummary

  /* -------------------------------------------------
     Daily Trend
  ------------------------------------------------- */
  const dailyTrend = useMemo(() => {
    const map: Record<string, number> = {}

    filteredData.forEach((d) => {
      map[d.Date] = (map[d.Date] || 0) + d.total_engine_on_hr
    })

    return Object.entries(map)
      .map(([date, hours]) => ({ date, hours }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredData])

  /* -------------------------------------------------
     UI STATES
  ------------------------------------------------- */
  if (loading)
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="animate-spin mr-2" /> Loading dashboard...
      </div>
    )

  if (!rawData.length)
    return (
      <div className="flex h-[80vh] items-center justify-center text-gray-400">
        No data found
      </div>
    )

  /* -------------------------------------------------
     UI
  ------------------------------------------------- */
  return (
    <main className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">🚛 Engine-On Dashboard</h1>

      {/* ---------------- FILTER BAR ---------------- */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
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

          <div className="flex items-end gap-2">
            <input
              type="checkbox"
              checked={highIdleOnly}
              onChange={(e) => setHighIdleOnly(e.target.checked)}
            />
            <label className="text-sm">⚠️ High Idle Only</label>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- KPI ---------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Vehicles</p>
            <p className="text-2xl font-bold">{vehicleSummary.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Total Engine-On (hr)</p>
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Avg / Vehicle (hr)</p>
            <p className="text-2xl font-bold">{avgHours.toFixed(1)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">⚠️ High Idle Vehicles</p>
            <p className="text-2xl font-bold text-red-600">
              {vehicleSummary.filter((v) => v.total_hours > avgHours * 1.5).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---------------- BAR ---------------- */}
      <Card>
        <CardContent className="p-6">
          <h2 className="font-semibold mb-2">Top Engine-On Vehicles</h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={finalVehicles.slice(0, 15)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="plate"
                angle={-45}
                textAnchor="end"
                height={80}
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
        <CardContent className="p-6">
          <h2 className="font-semibold mb-2">Daily Engine-On Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                dataKey="hours"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </main>
  )
}
