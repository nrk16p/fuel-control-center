"use client"

import dynamic from "next/dynamic"
import type { MapPoint } from "./EventMap"

const EventMap = dynamic(() => import("./EventMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[16px] bg-line" />,
})

export function EventMapLoader({ point }: { point: MapPoint | null }) {
  if (!point) {
    return (
      <div className="flex h-full items-center justify-center rounded-[16px] bg-cream text-[13px] text-muted-ink">
        ไม่มีพิกัดของเหตุการณ์นี้
      </div>
    )
  }
  return <EventMap point={point} />
}
