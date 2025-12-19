"use client"

import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

/* -------------------------------------------------
   Types
------------------------------------------------- */
interface DailyIdle {
  day: string
  total_trucks: number
  over_sla: number
  within_sla: number
  no_data: number
}

/* -------------------------------------------------
   Page
------------------------------------------------- */
export default function IdleDailyPage() {
  const [data, setData] = useState<DailyIdle[]>([])
  const [loading, setLoading] = useState(true)

  /* ---------------- Filters ---------------- */
  const [fleet, setFleet] = useState("")
  const [plant, setPlant] = useState("")
  const [supervisor, setSupervisor] = useState("")

  /* ---------------- Fetch ---------------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const params = new URLSearchParams({
        year: "2025",
        month: "12",
      })

      if (fleet) params.set("fleet", fleet)
      if (plant) params.set("plant", plant)
      if (supervisor) params.set("supervisor", supervisor)

      try {
        const res = await fetch(
          `/api/idle-daily-breakdown?${params.toString()}`
        )
        const json = await res.json()
        setData(json)
      } catch (err) {
        console.error("Failed to load idle daily data", err)
        setData([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [fleet, plant, supervisor])

  /* ---------------- UI States ---------------- */
  if (loading)
    return (
      <div className="flex h-[70vh] items-center justify-center text-gray-500">
        <Loader2 className="animate-spin mr-2" /> Loading dashboard...
      </div>
    )

  if (!data.length)
    return (
      <div className="flex h-[70vh] items-center justify-center text-gray-400">
        No data available
      </div>
    )

  /* ---------------- Derived (Latest Day KPI) ---------------- */
  const latest = data[data.length - 1]

  /* -------------------------------------------------
     Render
  ------------------------------------------------- */
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        🚛 Daily Truck Idle SLA Breakdown
      </h1>

      <p className="text-gray-500">
        Breakdown of trucks per day by SLA status
      </p>

      {/* ---------------- FILTER BAR ---------------- */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            placeholder="Fleet (ฟลีท)"
            className="border rounded px-2 py-1"
            value={fleet}
            onChange={(e) => setFleet(e.target.value)}
          />
          <input
            placeholder="Plant (แพล้นท์)"
            className="border rounded px-2 py-1"
            value={plant}
            onChange={(e) => setPlant(e.target.value)}
          />
          <input
            placeholder="Supervisor"
            className="border rounded px-2 py-1"
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* ---------------- KPI (LATEST DAY) ---------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Total Trucks</p>
            <p className="text-2xl font-bold">
              {latest.total_trucks}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 text-red-600">
              Over SLA
            </p>
            <p className="text-2xl font-bold text-red-600">
              {latest.over_sla}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 text-green-600">
              Within SLA
            </p>
            <p className="text-2xl font-bold text-green-600">
              {latest.within_sla}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">
              No Data
            </p>
            <p className="text-2xl font-bold text-gray-500">
              {latest.no_data}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---------------- STACKED BAR CHART ---------------- */}
      <Card>
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">
            📊 Truck SLA Status by Day
          </h2>

          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="over_sla"
                stackId="a"
                fill="#dc2626"
                name="Over SLA"
              />
              <Bar
                dataKey="within_sla"
                stackId="a"
                fill="#16a34a"
                name="Within SLA"
              />
              <Bar
                dataKey="no_data"
                stackId="a"
                fill="#9ca3af"
                name="No Data"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ---------------- TABLE ---------------- */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border rounded">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Day</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right text-red-600">Over SLA</th>
              <th className="p-2 text-right text-green-600">
                Within SLA
              </th>
              <th className="p-2 text-right">No Data</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t">
                <td className="p-2">{d.day}</td>
                <td className="p-2 text-right">
                  {d.total_trucks}
                </td>
                <td className="p-2 text-right text-red-600">
                  {d.over_sla}
                </td>
                <td className="p-2 text-right text-green-600">
                  {d.within_sla}
                </td>
                <td className="p-2 text-right">
                  {d.no_data}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
