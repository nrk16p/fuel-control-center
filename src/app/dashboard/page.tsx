"use client"

import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
   Chart Config (SHADCN)
------------------------------------------------- */
const chartConfig = {
  over_sla: {
    label: "Over SLA",
    color: "hsl(var(--destructive))",
  },
  within_sla: {
    label: "Within SLA",
    color: "hsl(var(--success, 142 76% 36%))",
  },
  no_data: {
    label: "No Data",
    color: "hsl(var(--muted-foreground))",
  },
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
      <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
        <Loader2 className="animate-spin mr-2" /> Loading dashboard...
      </div>
    )

  if (!data.length)
    return (
      <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
        No data available
      </div>
    )

  const latest = data[data.length - 1]

  /* -------------------------------------------------
     Render
  ------------------------------------------------- */
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        🚛 Daily Truck Idle SLA Breakdown
      </h1>

      <p className="text-muted-foreground">
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

      {/* ---------------- KPI ---------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Trucks", value: latest.total_trucks },
          { label: "Over SLA", value: latest.over_sla, color: "text-destructive" },
          { label: "Within SLA", value: latest.within_sla, color: "text-green-600" },
          { label: "No Data", value: latest.no_data, color: "text-muted-foreground" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                {kpi.label}
              </p>
              <p className={`text-2xl font-bold ${kpi.color ?? ""}`}>
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ---------------- SHADCN BAR CHART ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Truck SLA Status by Day</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[380px]">
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
              />
              <YAxis />

              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />

              <Bar
                dataKey="over_sla"
                stackId="a"
                fill="var(--color-over_sla)"
              />
              <Bar
                dataKey="within_sla"
                stackId="a"
                fill="var(--color-within_sla)"
              />
              <Bar
                dataKey="no_data"
                stackId="a"
                fill="var(--color-no_data)"
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ---------------- TABLE ---------------- */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border rounded">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">Day</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right text-destructive">Over SLA</th>
              <th className="p-2 text-right text-green-600">Within SLA</th>
              <th className="p-2 text-right">No Data</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t">
                <td className="p-2">{d.day}</td>
                <td className="p-2 text-right">{d.total_trucks}</td>
                <td className="p-2 text-right text-destructive">{d.over_sla}</td>
                <td className="p-2 text-right text-green-600">{d.within_sla}</td>
                <td className="p-2 text-right">{d.no_data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
