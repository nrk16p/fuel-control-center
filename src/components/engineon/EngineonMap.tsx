"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css";
import "leaflet-extra-markers";
import L from "leaflet";

export interface EventData {
  _id: string;
  lat?: number;
  lng?: number;
  สถานที่?: string;
  nearest_plant?: string | null;
  total_engine_on_min: number;
  total_engine_on_hr?: number;
  event_id?: number;
}

interface Props {
  events: EventData[];
  activeId: string | null;
  onSelect?: (id: string) => void;
}

/* -------------------------------------------------
   🎨 Custom Marker Icons (Leaflet-Extra-Markers)
------------------------------------------------- */
const defaultIcon = L.ExtraMarkers.icon({
  icon: "fa-truck", // Font Awesome icon
  markerColor: "cyan", // red, blue, green, purple, yellow, orange, cyan, black, etc.
  shape: "circle", // 'circle', 'square', 'star', 'penta'
  prefix: "fa",
});

const activeIcon = L.ExtraMarkers.icon({
  icon: "fa-star",
  markerColor: "orange",
  shape: "star",
  prefix: "fa",
});

/* -------------------------------------------------
   🗺️ Map Component
------------------------------------------------- */
export default function EngineonMap({ events, activeId, onSelect }: Props) {
  const validEvents = events.filter((e) => e.lat && e.lng);

  if (validEvents.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-100">
        🗺️ No coordinates found
      </div>
    );

  const selectedEvent = validEvents.find((e) => e._id === activeId) || validEvents[0];
  const center: [number, number] = [selectedEvent.lat!, selectedEvent.lng!];

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
      key={activeId}
      zoomControl={true}
    >
      {/* 🌍 Base Map */}
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
  );
}

/* -------------------------------------------------
   👁️ AutoFocus — Smooth fly to marker
------------------------------------------------- */
function AutoFocus({ activeEvent }: { activeEvent: EventData }) {
  const map = useMap();
  useEffect(() => {
    if (activeEvent?.lat && activeEvent?.lng) {
      map.flyTo([activeEvent.lat, activeEvent.lng], 14, {
        animate: true,
        duration: 0.8,
      });
    }
  }, [activeEvent, map]);
  return null;
}
