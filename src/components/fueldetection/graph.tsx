"use client"

import { useState, useMemo } from "react"
import { Chart as ChartJS, registerables } from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"

ChartJS.register(...registerables, zoomPlugin)

interface FuelDetectionData {
  _id: string
  วันที่: string
  เวลา: string
  ทะเบียนพาหนะ: string
  น้ำมัน: number
  "ความเร็ว(กม./ชม.)": number
}

export default function FuelDetectionGraph({
  data,
}: {
  data: FuelDetectionData[]
}) {
  const [showMockData, setShowMockData] = useState(false)

  const mockData: FuelDetectionData[] = [
    { _id: "1", วันที่: "14/12/2025", เวลา: "08:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 200, "ความเร็ว(กม./ชม.)": 0 },
    { _id: "2", วันที่: "14/12/2025", เวลา: "12:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 180, "ความเร็ว(กม./ชม.)": 45 },
    { _id: "3", วันที่: "14/12/2025", เวลา: "18:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 160, "ความเร็ว(กม./ชม.)": 30 },
  ]

  const displayData = showMockData ? mockData : data

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

  const chartData = {
    labels,
    datasets: [
      {
        type: "line" as const,
        label: "ระดับน้ำมัน (ลิตร)",
        data: fuelData,
        borderColor: "rgb(59,130,246)",
        yAxisID: "y",
        pointRadius: 0,
        tension: 0.2,
      },
      {
        type: "bar" as const,
        label: "ความเร็ว (กม./ชม.)",
        data: speedData,
        yAxisID: "y1",
        backgroundColor: "rgba(34,197,94,0.4)",
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x",
        },
        pan: {
          enabled: true,
          mode: "x",
        },
      },
    },
    scales: {
      x: {
        ticks: {
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
      y: { min: 0, max: 250 },
      y1: {
        position: "right",
        min: 0,
        max: 100,
        grid: { drawOnChartArea: false },
      },
    },
  }

  return (
    <div className="space-y-3">
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={showMockData}
          onChange={e => setShowMockData(e.target.checked)}
        />
        แสดง Mock Data
      </label>

      <div className="h-[500px] bg-white rounded shadow p-4">
        <Chart type="bar" data={chartData} options={options} />
      </div>
    </div>
  )
}
