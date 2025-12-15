"use client"

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import { useEffect } from "react"
import "leaflet/dist/leaflet.css"
import L from "leaflet"

// ✅ fix default marker icon import for Next.js + Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png"
import iconShadow from "leaflet/dist/images/marker-shadow.png"

const defaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
})

interface EventData {
  _id: string
  lat?: number
  lng?: number
  สถานที่?: string
  nearest_plant?: string | null
  total_engine_on_min: number
  total_engine_on_hr?: number
  event_id?: number
}

export default function EngineonMap({
  events,
  activeId,
}: {
  events: EventData[]
  activeId: string | null
}) {
  const validEvents = events.filter((e) => e.lat && e.lng)

  if (validEvents.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-100">
        🗺️ No coordinates found
      </div>
    )

  // center map on selected event if any
  const selectedEvent = validEvents.find((e) => e._id === activeId) || validEvents[0]
  const center: [number, number] = [selectedEvent.lat!, selectedEvent.lng!]

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-full w-full"
      scrollWheelZoom={true}
      key={activeId} // ensure re-render on selection
    >
      <TileLayer
        attribution='&copy; <a href="http://osm.org">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {validEvents.map((event) => (
        <Marker
          key={event._id}
          position={[event.lat!, event.lng!]}
          icon={
            event._id === activeId
              ? L.icon({
                  iconUrl,
                  shadowUrl: iconShadow,
                  iconSize: [30, 50],
                  iconAnchor: [15, 50],
                })
              : defaultIcon
          }
        >
          <Popup>
            <div className="text-sm">
              <strong>#{event.event_id}</strong> <br />
              {event.สถานที่ ?? "-"} <br />
              ⏱️ {event.total_engine_on_min.toFixed(1)} min
              <br />
              📍 {event.nearest_plant ?? "-"}
            </div>
          </Popup>
        </Marker>
      ))}

      <AutoFocus activeEvent={selectedEvent} />
    </MapContainer>
  )
}

// 👁️ Smoothly pans to active marker
function AutoFocus({ activeEvent }: { activeEvent: EventData }) {
  const map = useMap()
  useEffect(() => {
    if (activeEvent?.lat && activeEvent?.lng) {
      map.setView([activeEvent.lat, activeEvent.lng], 14, { animate: true })
    }
  }, [activeEvent, map])
  return null
}
