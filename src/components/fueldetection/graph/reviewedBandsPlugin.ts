import { Chart } from "chart.js"

export const reviewedBandsPlugin = {
  id: "reviewedBands",
  beforeDraw(chart: any, _args: any, opts: any) {
    const windows: Array<{ fromIdx: number; toIdx: number }> =
      opts?.windows || []
    if (!windows.length) return

    const { ctx, chartArea, scales } = chart
    const x = scales.x
    if (!x) return

    ctx.save()
    ctx.fillStyle = "rgba(59,130,246,0.08)"
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
  },
}

Chart.register(reviewedBandsPlugin as any)
