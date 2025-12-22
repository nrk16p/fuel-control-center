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

ChartJS.register(...registerables, zoomPlugin)

type Window = { fromIdx: number; toIdx: number }

interface Props {
  labels: string[]
  fuelData: number[]
  speedData: number[]
  bandWindows: {
    reviewed: Window[]
    unreviewed: Window[]
  }
  suspiciousWindows: Window[]
  onSelectIndex: (idx: number) => void
}

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
      },
      {
        type: "bar",
        label: "ความเร็ว (กม./ชม.)",
        data: speedData,
        yAxisID: "y1",
      },
    ],
  }

  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_e, els) => {
      const idx = els?.[0]?.index
      if (idx != null) onSelectIndex(idx)
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<"bar" | "line">) =>
            ctx.dataset.label?.includes("น้ำมัน")
              ? `⛽ ${ctx.parsed.y} ลิตร`
              : `🚗 ${ctx.parsed.y} กม./ชม.`,
        },
      },
      reviewedBands: {
        reviewed: bandWindows.reviewed,
        unreviewed: bandWindows.unreviewed,
        suspicious: suspiciousWindows,
      } as any,
    } as any,
    scales: {
      y: { min: 0 },
      y1: {
        position: "right",
        min: 0,
        grid: { drawOnChartArea: false },
      },
    },
  }

  return (
    <div className="h-[520px] rounded-xl border bg-white p-4 shadow-sm">
      <Chart type="bar" data={data} options={options} />
    </div>
  )
}
