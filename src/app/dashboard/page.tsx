"use client"

import { useEffect, useState } from "react"
import {
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

interface DailyIdle {
  date: string
  problem_cases: number
  supervisor_count: number
  truck_count: number
}

export default function SupervisorIdleDailyPage() {
  const [data, setData] = useState<DailyIdle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(
        "/api/supervisor-idle-daily?year=2025&month=12"
      )
      const json = await res.json()
      setData(json)
      setLoading(false)
    }
    load()
  }, [])

  if (loading)
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="animate-spin mr-2" /> Loading…
      </div>
    )

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        📅 Daily Supervisor Idle Problem
      </h1>

      <Card>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                dataKey="problem_cases"
                stroke="#dc2626"
                strokeWidth={2}
                name="Supervisor×Truck (Idle > SLA)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* KPI Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">Date</th>
              <th className="p-2 text-right">Problem Cases</th>
              <th className="p-2 text-right">Supervisors</th>
              <th className="p-2 text-right">Trucks</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-t">
                <td className="p-2">{d.date}</td>
                <td className="p-2 text-right text-red-600">
                  {d.problem_cases}
                </td>
                <td className="p-2 text-right">
                  {d.supervisor_count}
                </td>
                <td className="p-2 text-right">
                  {d.truck_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
