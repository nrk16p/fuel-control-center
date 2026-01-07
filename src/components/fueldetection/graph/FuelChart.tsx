"use client"

import { useMemo } from "react"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Chart } from "react-chartjs-2"
import { reviewedBandsPlugin, type Window, type ReviewedBandsOptions } from "./reviewedBandsPlugin"

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin,
  reviewedBandsPlugin
)

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

const CHART_COLORS = {
  FUEL_LINE: "rgb(59, 130, 246)", // Blue
  SPEED_BAR: "rgba(156, 163, 175, 0.5)", // Gray
} as const

export function FuelChart({
  labels,
  fuelData,
  speedData,
  bandWindows,
  suspiciousWindows,
  onSelectIndex,
}: Props) {
  const chartData: ChartData<"bar" | "line", number[], string> = useMemo(
    () => ({
      labels,
      datasets: [
        {
          type: "line" as const,
          label: "ระดับน้ำมัน (ลิตร)",
          data: fuelData,
          yAxisID: "y",
          borderColor: CHART_COLORS.FUEL_LINE,
          backgroundColor: CHART_COLORS.FUEL_LINE,
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: CHART_COLORS.FUEL_LINE,
          order: 1,
        },
        {
          type: "bar" as const,
          label: "ความเร็ว (กม./ชม.)",
          data: speedData,
          yAxisID: "y1",
          backgroundColor: CHART_COLORS.SPEED_BAR,
          borderColor: "transparent",
          order: 2,
        },
      ],
    }),
    [labels, fuelData, speedData]
  )

  const chartOptions: ChartOptions<"bar" | "line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index" as const,
        intersect: false,
      },
      onClick: (_event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          onSelectIndex(index)
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "top" as const,
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
          titleFont: {
            size: 13,
            weight: "bold",
          },
          bodyFont: {
            size: 12,
          },
          callbacks: {
            title: (items: TooltipItem<"bar" | "line">[]) => {
              const index = items[0]?.dataIndex
              return index != null ? labels[index] : ""
            },
            label: (context: TooltipItem<"bar" | "line">) => {
              const label = context.dataset.label || ""
              const value = context.parsed.y

              if (label.includes("น้ำมัน")) {
                return `⛽ ${label}: ${value.toFixed(2)} ลิตร`
              } else if (label.includes("ความเร็ว")) {
                return `🚗 ${label}: ${value.toFixed(0)} กม./ชม.`
              }

              return `${label}: ${value}`
            },
          },
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1,
            },
            pinch: {
              enabled: true,
            },
            mode: "x" as const,
          },
          pan: {
            enabled: true,
            mode: "x" as const,
          },
          limits: {
            x: {
              min: "original" as const,
              max: "original" as const,
            },
          },
        },
        reviewedBands: {
          unreviewed: bandWindows.unreviewed,
          reviewed: bandWindows.reviewed,
          suspicious: suspiciousWindows,
        } as ReviewedBandsOptions,
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false,
          },
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 20,
          },
        },
        y: {
          type: "linear" as const,
          display: true,
          position: "left" as const,
          min: 0,
          suggestedMax: 250,
          title: {
            display: true,
            text: "ระดับน้ำมัน (ลิตร)",
            font: {
              size: 12,
              weight: "bold",
            },
          },
          grid: {
            color: "rgba(0, 0, 0, 0.05)",
          },
        },
        y1: {
          type: "linear" as const,
          display: true,
          position: "right" as const,
          min: 0,
          suggestedMax: 100,
          title: {
            display: true,
            text: "ความเร็ว (กม./ชม.)",
            font: {
              size: 12,
              weight: "bold",
            },
          },
          grid: {
            drawOnChartArea: false,
          },
        },
      },
    }),
    [labels, bandWindows, suspiciousWindows, onSelectIndex]
  )

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          กราฟระดับน้ำมันและความเร็ว
        </h2>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
            <span>ยังไม่ได้ตรวจ</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 rounded"></div>
            <span>ตรวจแล้ว</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 rounded"></div>
            <span>ผิดปกติ</span>
          </div>
        </div>
      </div>

      <div className="h-[480px]">
        <Chart type="bar" data={chartData} options={chartOptions} />
      </div>

      <div className="mt-3 text-xs text-gray-500 text-center">
        💡 เลื่อนเมาส์เพื่อซูม, คลิกจุดบนกราฟเพื่อเลือกช่วงเวลา
      </div>
    </div>
  )
}