import { Chart, Plugin } from "chart.js"

export type Window = { fromIdx: number; toIdx: number }

export interface ReviewedBandsOptions {
  reviewed: Window[]
  unreviewed: Window[]
  suspicious: Window[]
}

// Color constants
const COLORS = {
  UNREVIEWED: "rgba(229, 231, 235, 0.35)", // Light gray
  REVIEWED: "rgba(59, 130, 246, 0.18)", // Light blue
  SUSPICIOUS: "rgba(239, 68, 68, 0.35)", // Light red
} as const

export const reviewedBandsPlugin: Plugin = {
  id: "reviewedBands",

  beforeDraw(chart, _args, options) {
    const opts = options as ReviewedBandsOptions

    if (!opts) return

    const { reviewed = [], unreviewed = [], suspicious = [] } = opts

    const { ctx, chartArea, scales } = chart

    if (!chartArea || !scales.x) return

    const xScale = scales.x

    /**
     * Paint windows with specified color
     */
    const paintWindows = (windows: Window[], color: string) => {
      if (!windows.length) return

      ctx.save()
      ctx.fillStyle = color

      for (const window of windows) {
        try {
          const x1 = xScale.getPixelForValue(window.fromIdx)
          const x2 = xScale.getPixelForValue(window.toIdx)

          const left = Math.max(chartArea.left, Math.min(x1, x2))
          const right = Math.min(chartArea.right, Math.max(x1, x2))

          if (right > left) {
            ctx.fillRect(
              left,
              chartArea.top,
              right - left,
              chartArea.bottom - chartArea.top
            )
          }
        } catch (error) {
          console.error("Error painting window:", error)
        }
      }

      ctx.restore()
    }

    // Paint in order (bottom → top layers)
    paintWindows(unreviewed, COLORS.UNREVIEWED)
    paintWindows(reviewed, COLORS.REVIEWED)
    paintWindows(suspicious, COLORS.SUSPICIOUS)
  },
}

// Register plugin globally
Chart.register(reviewedBandsPlugin)