"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface ProblemEvent {
  _id: string
  plate: string
  date: string
  start_time: string
  end_time: string
  total_engine_on_min: number
  lat?: number
  lng?: number
  nearest_plant?: string
  location?: string
}

export default function EngineonProblemPage() {
  const [data, setData] = useState<ProblemEvent[]>([])
  const [loading, setLoading] = useState(true)

  /* ---------------- Filters ---------------- */
  const [minMinutes, setMinMinutes] = useState(30)
  const [plate, setPlate] = useState("")
  const [date, setDate] = useState("")

  useEffect(() => {
    const load = async () => {
      const params = new URLSearchParams()
      params.set("min_minutes", String(minMinutes))
      if (plate) params.set("plate", plate)
      if (date) params.set("date", date)

      const res = await fetch(`/api/engineon-problem?${params}`)
      const json = await res.json()
      setData(json)
      setLoading(false)
    }
    load()
  }, [minMinutes, plate, date])

  /* ---------------- Group by Vehicle ---------------- */
  const byVehicle = useMemo(() => {
    const map: any = {}
    data.forEach((d) => {
      if (!map[d.plate]) {
        map[d.plate] = {
          plate: d.plate,
          total_min: 0,
          count: 0,
        }
      }
      map[d.plate].total_min += d.total_engine_on_min
      map[d.plate].count += 1
    })
    return Object.values(map).sort(
      (a: any, b: any) => b.total_min - a.total_min
    )
  }, [data])

  if (loading)
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="animate-spin mr-2" /> Loading…
      </div>
    )

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        🚨 Long Engine-On Problem Dashboard
      </h1>

      {/* ---------------- FILTER ---------------- */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm">Min Minutes</label>
            <input
              type="number"
              className="border rounded px-2 py-1 w-full"
              value={minMinutes}
              onChange={(e) => setMinMinutes(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-sm">Plate</label>
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="72-9473"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm">Date (DD/MM/YYYY)</label>
            <input
              className="border rounded px-2 py-1 w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------------- WHICH CAR ---------------- */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-2">
            🚛 Vehicles with Long Engine-On
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byVehicle.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="plate" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total_min" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ---------------- EVENT TABLE ---------------- */}
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">Plate</th>
              <th className="p-2">Date</th>
              <th className="p-2">Minutes</th>
              <th className="p-2">Plant</th>
              <th className="p-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 50).map((d) => (
              <tr key={d._id} className="border-t">
                <td className="p-2 font-medium">{d.plate}</td>
                <td className="p-2">{d.date}</td>
                <td className="p-2 text-right text-red-600">
                  {d.total_engine_on_min.toFixed(1)}
                </td>
                <td className="p-2">{d.nearest_plant ?? "-"}</td>
                <td className="p-2 truncate max-w-md">
                  {d.location ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
