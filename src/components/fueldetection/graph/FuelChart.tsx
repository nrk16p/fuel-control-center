"use client"

import {
  Chart as ChartJS,
  registerables,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"
import "./reviewedBandsPlugin"

/* ---------------------------------------
   Register Chart.js
--------------------------------------- */
ChartJS.register(...registerables, zoomPlugin)

/* ---------------------------------------
   Types
--------------------------------------- */
type Window = { fromIdx: number; toIdx: number }

interface Props {
  labels: string[]                // e.g. "23/12/2025 21:34"
  fuelData: number[]
  speedData: number[]
  bandWindows: {
    reviewed: Window[]
    unreviewed: Window[]
  }
  /** 🔴 highlight สำหรับ reviewed_suspicious */
  suspiciousWindows: Window[]
  onSelectIndex: (idx: number) => void
}

/* ---------------------------------------
   Component
--------------------------------------- */
export function FuelChart({
  labels,
  fuelData,
  speedData,
  bandWindows,
  suspiciousWindows,
  onSelectIndex,
}: Props) {
  const data: ChartData<"bar" | "line", number[], string> = {
    labels,
    datasets: [
      {
        type: "line",
        label: "ระดับน้ำมัน (ลิตร)",
        data: fuelData,
        yAxisID: "y",
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 0,
        order: 1,
      },
      {
        type: "bar",
        label: "ความเร็ว (กม./ชม.)",
        data: speedData,
        yAxisID: "y1",
        order: 2,
      },
    ],
  }

  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },

    onClick: (_evt, elements) => {
      const idx = elements?.[0]?.index
      if (idx != null) onSelectIndex(idx)
    },

    plugins: {
      tooltip: {
        callbacks: {
          /* ---------------------------------------
             🕒 FIX TIMEZONE: ใช้ label จาก DB โดยตรง
          --------------------------------------- */
          title: (items: TooltipItem<"bar" | "line">[]) => {
            const idx = items[0]?.dataIndex
            if (idx == null) return ""

            // ใช้ labels ที่ส่งเข้ามาโดยตรง → ไม่โดน timezone
            return labels[idx]
          },

          /* แสดงค่า Y ตามเดิม */
          label: (ctx: TooltipItem<"bar" | "line">) =>
            ctx.dataset.label?.includes("น้ำมัน")
              ? `⛽ ${ctx.parsed.y} ลิตร`
              : `🚗 ${ctx.parsed.y} กม./ชม.`,
        },
      },

      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x",
        },
        pan: { enabled: true, mode: "x" },
      },

      /* ---------------------------------------
         🔴 reviewed / unreviewed / suspicious
      --------------------------------------- */
      reviewedBands: {
        unreviewed: bandWindows.unreviewed,
        reviewed: bandWindows.reviewed,
        suspicious: suspiciousWindows, // 🔴 layer บนสุด
      } as any,
    } as any,

    scales: {
      y: {
        min: 0,
        suggestedMax: 250,
        title: {
          display: true,
          text: "ระดับน้ำมัน (ลิตร)",
        },
      },
      y1: {
        position: "right",
        min: 0,
        suggestedMax: 100,
        grid: { drawOnChartArea: false },
        title: {
          display: true,
          text: "ความเร็ว (กม./ชม.)",
        },
      },
    },
  }

  return (
    <div className="h-[520px] rounded-xl border bg-white p-4 shadow-sm">
      <Chart type="bar" data={data} options={options} />
    </div>
  )
}
