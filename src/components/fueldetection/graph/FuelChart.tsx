"use client"

import { useMemo, useRef, useCallback } from "react"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
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
  LineController,
  BarController,
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
  FUEL_LINE: "rgb(59, 130, 246)",
  SPEED_BAR: "rgba(156, 163, 175, 0.5)",
} as const

export function FuelChart({
  labels,
  fuelData,
  speedData,
  bandWindows,
  suspiciousWindows,
  onSelectIndex,
}: Props) {
  // ✅ Store chart reference to preserve zoom state
  const chartRef = useRef<ChartJS<"bar" | "line", number[], string> | null>(null)

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

  // ✅ Reset zoom handler
  const handleResetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }, [])

  const chartOptions: ChartOptions<"bar" | "line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // ✅ Disable animation to preserve zoom on updates
      animation: {
        duration: 0,
      },
      interaction: {
        mode: "index" as const,
        intersect: false,
      },
      // ✅ Click handler - zoom stays preserved
      onClick: (_event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          if (index != null) {
            onSelectIndex(index)
          }
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
            weight: "bold" as const,
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

              // Handle null/undefined values
              if (value == null || isNaN(value)) {
                return `${label}: N/A`
              }

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
            drag: {
              enabled: false,   // 🔒 ปิด drag-zoom (กัน click / double-click ชน zoom)
            },
            mode: "x" as const,
          },
          pan: {
            enabled: true,      // ลาก = pan เท่านั้น
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
              weight: "bold" as const,
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
              weight: "bold" as const,
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
      {/* Header with Reset Zoom Button */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">
          กราฟระดับน้ำมันและความเร็ว
        </h2>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gray-200 rounded"></div>
              <span>ยังไม่ได้ตรวจ</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-blue-100 rounded"></div>
              <span>ตรวจแล้ว</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-red-100 rounded"></div>
              <span>ผิดปกติ</span>
            </div>
          </div>

          {/* Reset Zoom Button */}
          <button
            onClick={handleResetZoom}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
            title="รีเซ็ต Zoom กลับมุมมองเริ่มต้น"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
              />
            </svg>
            <span className="hidden sm:inline">รีเซ็ต Zoom</span>
            <span className="sm:hidden">รีเซ็ต</span>
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[480px]">
        <Chart
          ref={chartRef}
          type="bar"
          data={chartData}
          options={chartOptions}
        />
      </div>

      {/* Instructions */}
      <div className="mt-3 space-y-1">
        <div className="text-xs text-gray-500 text-center">
          💡 <strong>Zoom:</strong> เลื่อนล้อเมาส์ | <strong>Pan:</strong> ลากเมาส์ | <strong>Select:</strong> คลิกจุดบนกราฟ
        </div>
        <div className="text-xs text-blue-600 text-center font-medium">
          🔍 Zoom จะไม่รีเซ็ตเมื่อคลิกเลือกช่วงเวลา - กดปุ่ม "รีเซ็ต Zoom" เพื่อกลับมุมมองเริ่มต้น
        </div>
      </div>
    </div>
  )
}