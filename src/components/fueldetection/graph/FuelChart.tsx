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

ChartJS.register(...registerables, zoomPlugin)

interface Props {
  labels: string[]
  fuelData: number[]
  speedData: number[]
  reviewIndexWindows: Array<{ fromIdx: number; toIdx: number }>
  onSelectIndex: (idx: number) => void
}

export function FuelChart({
  labels,
  fuelData,
  speedData,
  reviewIndexWindows,
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
          label: (ctx: TooltipItem<"bar" | "line">) =>
            ctx.dataset.label?.includes("น้ำมัน")
              ? `⛽ ${ctx.parsed.y} ลิตร`
              : `🚗 ${ctx.parsed.y} กม./ชม.`,
        },
      },
      zoom: {
        zoom: { wheel: { enabled: true }, mode: "x" },
        pan: { enabled: true, mode: "x" },
      },
      reviewedBands: { windows: reviewIndexWindows } as any,
    } as any,
    scales: {
      y: { min: 0, suggestedMax: 250 },
      y1: {
        position: "right",
        min: 0,
        suggestedMax: 100,
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
