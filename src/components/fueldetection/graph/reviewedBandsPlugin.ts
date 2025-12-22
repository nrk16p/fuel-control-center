import { Chart } from "chart.js"

type Window = { fromIdx: number; toIdx: number }

export const reviewedBandsPlugin = {
  id: "reviewedBands",
  beforeDraw(chart: any, _args: any, opts: any) {
    const reviewed: Window[] = opts?.reviewed || []
    const unreviewed: Window[] = opts?.unreviewed || []
    const suspicious: Window[] = opts?.suspicious || []

    const { ctx, chartArea, scales } = chart
    const x = scales.x
    if (!x) return

    const paint = (windows: Window[], color: string) => {
      ctx.save()
      ctx.fillStyle = color
      for (const w of windows) {
        const x1 = x.getPixelForValue(w.fromIdx)
        const x2 = x.getPixelForValue(w.toIdx)
        const left = Math.max(chartArea.left, Math.min(x1, x2))
        const right = Math.min(chartArea.right, Math.max(x1, x2))
        ctx.fillRect(
          left,
          chartArea.top,
          right - left,
          chartArea.bottom - chartArea.top
        )
      }
      ctx.restore()
    }

    // order matters (bottom → top)
    paint(unreviewed, "rgba(229,231,235,0.35)")   // ⚪ unreviewed
    paint(reviewed, "rgba(59,130,246,0.18)")     // 🔵 reviewed
    paint(suspicious, "rgba(239,68,68,0.35)")    // 🔴 suspicious
  },
}

Chart.register(reviewedBandsPlugin as any)
