"use client"

import { useState, useMemo } from "react"
import { Chart as ChartJS, registerables } from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"

ChartJS.register(...registerables, zoomPlugin)

/* ================= Types ================= */
interface FuelDetectionData {
  _id: string
  วันที่: string
  เวลา: string
  ทะเบียนพาหนะ: string
  น้ำมัน: number
  "ความเร็ว(กม./ชม.)": number
}

/* ================= Component ================= */
export const FuelDetectionGraph = ({
  data,
}: {
  data: FuelDetectionData[]
}) => {
  const [showMockData, setShowMockData] = useState(false)

  /* ================= Mock Data ================= */
  const mockData: FuelDetectionData[] = [
    { _id: "1", วันที่: "14/12/2025", เวลา: "08:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 200, "ความเร็ว(กม./ชม.)": 0 },
    { _id: "2", วันที่: "14/12/2025", เวลา: "12:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 180, "ความเร็ว(กม./ชม.)": 45 },
    { _id: "3", วันที่: "14/12/2025", เวลา: "18:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 160, "ความเร็ว(กม./ชม.)": 30 },

    { _id: "4", วันที่: "15/12/2025", เวลา: "08:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 155, "ความเร็ว(กม./ชม.)": 0 },
    { _id: "5", วันที่: "15/12/2025", เวลา: "12:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 140, "ความเร็ว(กม./ชม.)": 55 },
    { _id: "6", วันที่: "15/12/2025", เวลา: "18:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 120, "ความเร็ว(กม./ชม.)": 40 },

    { _id: "7", วันที่: "16/12/2025", เวลา: "08:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 200, "ความเร็ว(กม./ชม.)": 0 },
    { _id: "8", วันที่: "16/12/2025", เวลา: "12:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 175, "ความเร็ว(กม./ชม.)": 60 },
    { _id: "9", วันที่: "16/12/2025", เวลา: "18:00", ทะเบียนพาหนะ: "71-8623", น้ำมัน: 150, "ความเร็ว(กม./ชม.)": 35 },
  ]

  const displayData = showMockData ? mockData : data

  /* ================= Prepare Data ================= */
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

  /* ================= Chart Data ================= */
  const chartData = {
    labels,
    datasets: [
      {
        type: "line" as const,
        label: "ระดับน้ำมัน (ลิตร)",
        data: fuelData,
        borderColor: "rgb(59,130,246)",
        backgroundColor: "rgb(59,130,246)",
        tension: 0.2,
        yAxisID: "y",
        pointRadius: 0,          // ✅ ไม่มี marker
        pointHoverRadius: 4,
        borderWidth: 2,
        order: 1,
      },
      {
        type: "bar" as const,
        label: "ความเร็ว (กม./ชม.)",
        data: speedData,
        yAxisID: "y1",
        backgroundColor: "rgba(34,197,94,0.4)", // ✅ ลด noise
        borderWidth: 0,
        order: 2,
      },
    ],
  }

  /* ================= Options ================= */
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: "ระดับน้ำมัน & ความเร็ว (ซูม / ลากได้)",
        font: { size: 18, weight: "bold" as const },
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
        callbacks: {
          label: (ctx: any) => {
            const v = ctx.parsed.y
            if (ctx.dataset.label.includes("น้ำมัน")) {
              return `⛽ น้ำมัน: ${v} ลิตร`
            }
            return `🚗 ความเร็ว: ${v} กม./ชม.`
          },
        },
      },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x" as const,
        },
        pan: {
          enabled: true,
          mode: "x" as const,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          autoSkip: true,
          maxTicksLimit: 10, // ✅ อ่านง่าย
          maxRotation: 0,
          font: { size: 11 },
        },
        title: {
          display: true,
          text: "วันที่ / เวลา",
        },
      },
      y: {
        position: "left" as const,
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
        position: "right" as const,
        min: 0,
        max: 100,
        grid: { drawOnChartArea: false },
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

  /* ================= Render ================= */
  return (
    <div className="w-full space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showMockData}
          onChange={e => setShowMockData(e.target.checked)}
        />
        แสดง Mock Data
      </label>

      <div className="bg-white rounded-lg shadow p-4 h-[520px]">
        <Chart type="bar" data={chartData} options={options} />
      </div>
    </div>
  )
}
