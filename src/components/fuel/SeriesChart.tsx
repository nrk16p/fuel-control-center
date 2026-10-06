"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import type { OverlayBand, OverlayMarker, OverlayRefuel } from "@/components/fueldetection/graph/fuelOverlayPlugin"
import { levelAt, type SourceSeries } from "@/lib/fuel-series"
import type { FuelEvent } from "@/lib/fuel-types"

// Chart.js ต้องมี window — โหลดเฉพาะฝั่ง client
const FuelChart = dynamic(() => import("@/components/fueldetection/graph/FuelChart").then((m) => m.FuelChart), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-[22px] bg-line" />,
})

type ChartEvent = Pick<FuelEvent, "_id" | "start" | "end" | "class" | "litres" | "decision">

type Props = {
  series: SourceSeries
  events: ChartEvent[]
  selectedId?: string | null
  height?: number
  title?: string
  subtitle?: string
}

const LOSS_CLASSES = new Set<string>(["suspected_loss", "gap_loss"])

/** เส้น gps_series หนึ่งแหล่ง + แถบ/หมุดของเหตุการณ์ บน FuelChart เดิม */
export function SeriesChart({ series, events, selectedId = null, height = 360, title, subtitle }: Props) {
  const overlay = useMemo(() => {
    const bands: OverlayBand[] = []
    const markers: OverlayMarker[] = []
    const refuels: OverlayRefuel[] = []
    events.forEach((e, i) => {
      const startTs = Date.parse(e.start)
      const endTs = Date.parse(e.end)
      const fuel = levelAt(series, (startTs + endTs) / 2)
      if (e.class === "refuel") {
        refuels.push({ ts: endTs, fuel, amount: e.litres })
        return
      }
      const cleared = e.decision === "noise" || e.decision === "legit" || !LOSS_CLASSES.has(e.class)
      const tone = cleared ? ("muted" as const) : ("clay" as const)
      const selected = e._id === selectedId
      bands.push({ startTs, endTs, tone, strength: selected ? 0.18 : 0.08 })
      markers.push({ n: i + 1, ts: (startTs + endTs) / 2, fuel, tone, selected })
    })
    return { bands, markers, refuels, selection: null }
  }, [series, events, selectedId])

  return (
    <FuelChart
      ts={series.ts}
      smooth={series.fuel}
      lo={series.lo}
      hi={series.hi}
      speed={series.speed}
      status={series.status}
      overlay={overlay}
      focus={null}
      title={title}
      subtitle={subtitle ?? "เส้นทึบ = ค่ากลางรายนาที · แถบจาง = ช่วงค่าดิบในนาที · เลื่อนล้อเมาส์เพื่อซูม"}
      smoothLabel="น้ำมัน (ค่ากลางรายนาที)"
      height={height}
    />
  )
}
