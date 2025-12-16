"use client"

import dynamic from "next/dynamic"
import type { FC } from "react"
import type { EventData } from "./EngineonMap"

/* -------------------------------------------------
   🧩 Props (CONTRACT กลาง)
------------------------------------------------- */
export interface EngineonMapClientProps {
  events: EventData[]
  activeId: string | null
  hoverId: string | null
  onSelect?: (id: string) => void
}

/* -------------------------------------------------
   🗺️ Dynamic Map Loader
------------------------------------------------- */
const EngineonMap = dynamic(() => import("./EngineonMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-100 text-gray-500">
      🗺️ Loading interactive map...
    </div>
  ),
})

/**
 * EngineonMapClient
 * - Adapter ระหว่าง DetailClient ↔ Leaflet map
 * - ปลอดภัยกับ SSR
 * - Props ตรงกับ EngineonMap 100%
 */
const EngineonMapClient: FC<EngineonMapClientProps> = ({
  events,
  activeId,
  hoverId,
  onSelect,
}) => {
  return (
    <div className="w-full h-full">
      <EngineonMap
        events={events}
        activeId={activeId}
        hoverId={hoverId}
        onSelect={onSelect}
      />
    </div>
  )
}

export default EngineonMapClient
