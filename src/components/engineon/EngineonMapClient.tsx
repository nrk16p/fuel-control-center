"use client"

import dynamic from "next/dynamic"
import type { FC } from "react"

// ✅ Dynamically load the actual Leaflet map
const EngineonMap = dynamic(() => import("./EngineonMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-100 text-gray-500">
      🗺️ Loading interactive map...
    </div>
  ),
})

interface RawEngineonData {
  _id: string
  lat?: number
  lng?: number
  สถานที่?: string
  nearest_plant?: string | null
  total_engine_on_min: number
  total_engine_on_hr?: number
  event_id?: number
}

interface Props {
  events: RawEngineonData[]
  selectedId?: string
}

/**
 * ✅ EngineonMapClient
 * - Handles safe rendering of the dynamic map
 * - Avoids hook mismatches (no early returns)
 * - Passes selectedId to highlight markers
 */
const EngineonMapClient: FC<Props> = ({ events = [], selectedId }) => {
  // Always render EngineonMap even if events empty → prevents hook mismatch
  return (
    <div className="w-full h-full">
      <EngineonMap events={events} activeId={selectedId ?? null} />
    </div>
  )
}

export default EngineonMapClient
