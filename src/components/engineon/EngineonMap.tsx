"use client"

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet"
import { useEffect } from "react"
import "leaflet/dist/leaflet.css"
import "leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css"
import "leaflet-extra-markers"
import L from "leaflet"

/* -------------------------------------------------
   📦 Types
------------------------------------------------- */
export interface EventData {
  _id: string
  lat?: number
  lng?: number
  สถานที่?: string
  nearest_plant?: string | null
  total_engine_on_min: number
  event_id?: number
}

interface Props {
  events: EventData[]
  activeId: string | null
  hoverId: string | null
  onSelect?: (id: string) => void
}

/* -------------------------------------------------
   🎨 Marker Icons
------------------------------------------------- */

// ⭐ Active marker
const activeIcon = L.ExtraMarkers.icon({
  icon: "fa-star",
  markerColor: "blue",
  shape: "star",
  prefix: "fa",
})

// 👁 Hover marker
const hoverIcon = L.ExtraMarkers.icon({
  icon: "fa-eye",
  markerColor: "purple",
  shape: "circle",
  prefix: "fa",
})

// 🔥 Engine-On level marker
function getEngineOnIcon(min: number) {
  if (min > 60) {
    return L.ExtraMarkers.icon({
      icon: "fa-fire",
      markerColor: "red",
      shape: "circle",
      prefix: "fa",
    })
  }

  if (min >= 30) {
    return L.ExtraMarkers.icon({
      icon: "fa-exclamation",
      markerColor: "orange",
      shape: "circle",
      prefix: "fa",
    })
  }

  return L.ExtraMarkers.icon({
    icon: "fa-truck",
    markerColor: "green",
    shape: "circle",
    prefix: "fa",
  })
}

/* -------------------------------------------------
   🗺️ Map Component
------------------------------------------------- */
export default function EngineonMap({
  events,
  activeId,
  hoverId,
  onSelect,
}: Props) {
  const validEvents = events.filter(
    (e): e is EventData & { lat: number; lng: number } =>
      typeof e.lat === "number" && typeof e.lng === "number"
  )

  if (validEvents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-100 rounded-lg">
        🗺️ No coordinates found
      </div>
    )
  }

  const selectedEvent = activeId
    ? validEvents.find((e) => e._id === activeId) ?? null
    : null

  const defaultCenter: [number, number] = [
    validEvents[0].lat,
    validEvents[0].lng,
  ]

  return (
    <div className="relative z-0 h-full w-full">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        scrollWheelZoom
        zoomControl
        className="h-full w-full rounded-lg relative z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://osm.org">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 📍 Markers */}
        {validEvents.map((event) => {
          const icon =
            event._id === activeId
              ? activeIcon
              : event._id === hoverId
              ? hoverIcon
              : getEngineOnIcon(event.total_engine_on_min)

          return (
            <Marker
              key={event._id}
              position={[event.lat, event.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelect?.(event._id),
              }}
            >
              <Popup>
                <div className="text-sm leading-snug">
                  <strong>#{event.event_id ?? "-"}</strong>
                  <br />
                  📍 {event.nearest_plant ?? "-"}
                  <br />
                  🏙️ {event.สถานที่ ?? "-"}
                  <br />
                  ⏱️ {event.total_engine_on_min.toFixed(1)} นาที
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* 🔵 Active highlight */}
        {selectedEvent && (
          <>
            <Circle
              center={[selectedEvent.lat, selectedEvent.lng]}
              radius={150}
              pathOptions={{
                color: "#2563eb",
                fillColor: "#3b82f6",
                fillOpacity: 0.2,
              }}
            />
            <AutoFocus activeEvent={selectedEvent} />
          </>
        )}

        {/* 📊 Legend */}
        <Legend />
      </MapContainer>
    </div>
  )
}

/* -------------------------------------------------
   👁️ AutoFocus — fly to active
------------------------------------------------- */
function AutoFocus({
  activeEvent,
}: {
  activeEvent: EventData & { lat: number; lng: number }
}) {
  const map = useMap()

  useEffect(() => {
    map.flyTo([activeEvent.lat, activeEvent.lng], 14, {
      animate: true,
      duration: 0.8,
    })
  }, [activeEvent, map])

  return null
}

/* -------------------------------------------------
   📊 Legend Control
------------------------------------------------- */
function Legend() {
  const map = useMap()

  useEffect(() => {
    const legend = new L.Control({ position: "bottomright" })

    legend.onAdd = () => {
      const div = L.DomUtil.create(
        "div",
        "leaflet-control bg-white p-3 rounded shadow text-xs leading-snug"
      )

      div.innerHTML = `
        <div class="font-semibold mb-1">Engine-On Level</div>
        <div>🟢 &lt; 30 นาที</div>
        <div>🟠 30–60 นาที</div>
        <div>🔴 &gt; 60 นาที 🔥</div>
        <hr class="my-1" />
        <div>⭐ Selected</div>
        <div>👁 Hover</div>
      `

      return div
    }

    legend.addTo(map)
    return () => {
      legend.remove()
    }
  }, [map])

  return null
}
