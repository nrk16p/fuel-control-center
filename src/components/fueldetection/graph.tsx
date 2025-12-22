"use client"

import { useState, useMemo } from "react"
import {
  Chart as ChartJS,
  registerables,
  type ChartOptions,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"

/* --------------------------------------------------
   Register Chart.js
-------------------------------------------------- */
ChartJS.register(...registerables, zoomPlugin)

/* --------------------------------------------------
   Types
-------------------------------------------------- */
export interface FuelDetectionData {
  _id: string
  วันที่: string
  เวลา: string
  ทะเบียนพาหนะ: string
  น้ำมัน: number
  "ความเร็ว(กม./ชม.)": number
}

/* --------------------------------------------------
   Component
-------------------------------------------------- */
export default function FuelDetectionGraph({
  data,
}: {
  data: FuelDetectionData[]
}) {
  const [showMockData, setShowMockData] = useState(false)

  /* ---------------- Mock (optional) ---------------- */
  const mockData: FuelDetectionData[] = [
    { _id: "1", วันที่: "14/12/2025", เวลา: "08:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 200, "ความเร็ว(กม./ชม.)": 0 },
    { _id: "2", วันที่: "14/12/2025", เวลา: "12:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 180, "ความเร็ว(กม./ชม.)": 45 },
    { _id: "3", วันที่: "14/12/2025", เวลา: "18:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 160, "ความเร็ว(กม./ชม.)": 30 },

    { _id: "4", วันที่: "15/12/2025", เวลา: "08:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 155, "ความเร็ว(กม./ชม.)": 0 },
    { _id: "5", วันที่: "15/12/2025", เวลา: "12:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 140, "ความเร็ว(กม./ชม.)": 55 },
    { _id: "6", วันที่: "15/12/2025", เวลา: "18:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 120, "ความเร็ว(กม./ชม.)": 40 },
  ]

  const displayData = showMockData ? mockData : data

  /* ---------------- Prepare data ---------------- */
  const labels = useMemo(
    () => displayData.map(d => `${d.วันที่} ${d.เวลา}`),
    [displayData]
  )

  const fuelData = useMemo(
    () => displayData.map(d => d.น้ำมัน),
    [displayData]
  )

  const speedData = useMemo(
    () => displayData.map(d => d["ความเร็ว(กม./ชม.)"]),
    [displayData]
  )

  /* ---------------- Chart data ---------------- */
  const chartData = {
    labels,
    datasets: [
      {
        type: "line" as const,
        label: "ระดับน้ำมัน (ลิตร)",
        data: fuelData,
        yAxisID: "y",
        borderColor: "rgb(59,130,246)",
        backgroundColor: "rgb(59,130,246)",
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 0,        // ❌ no marker
        pointHoverRadius: 4,
        order: 1,
      },
      {
        type: "bar" as const,
        label: "ความเร็ว (กม./ชม.)",
        data: speedData,
        yAxisID: "y1",
        backgroundColor: "rgba(34,197,94,0.4)",
        borderWidth: 0,
        order: 2,
      },
    ],
  }

  /* ---------------- Options (TYPE SAFE) ---------------- */
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top",
      },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed.y
            if (ctx.dataset.label?.includes("น้ำมัน")) {
              return `⛽ น้ำมัน: ${value} ลิตร`
            }
            return `🚗 ความเร็ว: ${value} กม./ชม.`
          },
        },
      },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x",     // ✅ TS OK
        },
        pan: {
          enabled: true,
          mode: "x",     // ✅ TS OK
        },
      },
    },
    scales: {
      x: {
        ticks: {
          autoSkip: true,
          maxTicksLimit: 10,
          maxRotation: 0,
          font: {
            size: 11,
          },
        },
        title: {
          display: true,
          text: "วันที่ / เวลา",
        },
      },
      y: {
        min: 0,
        max: 250,
        title: {
          display: true,
          text: "ระดับน้ำมัน (ลิตร)",
          color: "rgb(59,130,246)",
        },
        ticks: {
          color: "rgb(59,130,246)",
        },
      },
      y1: {
        position: "right",
        min: 0,
        max: 100,
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: "ความเร็ว (กม./ชม.)",
          color: "rgb(34,197,94)",
        },
        ticks: {
          color: "rgb(34,197,94)",
        },
      },
    },
  }

  /* ---------------- Render ---------------- */
  return (
    <div className="w-full space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showMockData}
          onChange={(e) => setShowMockData(e.target.checked)}
        />
        แสดง Mock Data
      </label>

      <div className="h-[500px] rounded-xl border bg-white p-4 shadow-sm">
        <Chart type="bar" data={chartData} options={options} />
      </div>
    </div>
  )
}
