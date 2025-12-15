"use client"

import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet"
import { useEffect } from "react"
import "leaflet/dist/leaflet.css"
import L from "leaflet"

// ✅ Fix Leaflet marker assets for Next.js
import iconUrl from "leaflet/dist/images/marker-icon.png"
import iconShadow from "leaflet/dist/images/marker-shadow.png"

// Default marker icon
const defaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
})

// Highlighted marker for selected event
const activeIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [30, 50],
  iconAnchor: [15, 50],
})

export interface EventData {
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
  events: EventData[]
  activeId: string | null
  onSelect?: (id: string) => void
}

export default function EngineonMap({ events, activeId, onSelect }: Props) {
  const validEvents = events.filter((e) => e.lat && e.lng)

  if (validEvents.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-100">
        🗺️ No coordinates found
      </div>
    )

  const selectedEvent = validEvents.find((e) => e._id === activeId) || validEvents[0]
  const center: [number, number] = [selectedEvent.lat!, selectedEvent.lng!]

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full"
      key={activeId}
    >
      {/* 🗺️ Base Map */}
      <TileLayer
        attribution='&copy; <a href="https://osm.org">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* 📍 Markers */}
      {validEvents.map((event) => (
        <Marker
          key={event._id}
          position={[event.lat!, event.lng!]}
          icon={event._id === activeId ? activeIcon : defaultIcon}
          eventHandlers={{
            click: () => onSelect?.(event._id),
          }}
        >
          <Popup>
            <div className="text-sm leading-snug">
              <strong>#{event.event_id ?? "-"}</strong> <br />
              📍 {event.nearest_plant ?? "-"} <br />
              🏙️ {event.สถานที่ ?? "-"} <br />
              ⏱️ {event.total_engine_on_min.toFixed(1)} นาที
            </div>
          </Popup>
        </Marker>
      ))}

      {/* 🔵 Highlight Circle */}
      {selectedEvent && (
        <Circle
          center={[selectedEvent.lat!, selectedEvent.lng!]}
          radius={150}
          pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.2 }}
        />
      )}

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
