"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css";
import "leaflet-extra-markers";
import L from "leaflet";

/* -------------------------------------------------
   📦 Types
------------------------------------------------- */
export interface EventData {
  _id: string;
  lat?: number;
  lng?: number;
  สถานที่?: string;
  nearest_plant?: string | null;
  total_engine_on_min: number;
  event_id?: number;
}

interface Props {
  events: EventData[];
  activeId: string | null;
  hoverId?: string | null;
  onSelect?: (id: string) => void;
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
});

// 👁 Hover marker
const hoverIcon = L.ExtraMarkers.icon({
  icon: "fa-eye",
  markerColor: "purple",
  shape: "circle",
  prefix: "fa",
});

// 🔥 Engine-On level marker (RULE ใหม่)
function getEngineOnIcon(min: number) {
  // 🔴 หนัก > 60 นาที
  if (min > 60) {
    return L.ExtraMarkers.icon({
      icon: "fa-fire",
      markerColor: "red",
      shape: "circle",
      prefix: "fa",
    });
  }

  // 🟠 กลาง 30–60 นาที
  if (min >= 30) {
    return L.ExtraMarkers.icon({
      icon: "fa-exclamation",
      markerColor: "orange",
      shape: "circle",
      prefix: "fa",
    });
  }

  // 🟢 น้อย < 30 นาที
  return L.ExtraMarkers.icon({
    icon: "fa-truck",
    markerColor: "green",
    shape: "circle",
    prefix: "fa",
  });
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
  const validEvents = events.filter((e) => e.lat && e.lng);

  if (validEvents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-100">
        🗺️ No coordinates found
      </div>
    );
  }

  // ❌ ไม่มี active ตั้งต้น
  const selectedEvent = activeId
    ? validEvents.find((e) => e._id === activeId) ?? null
    : null;

  // center เริ่มต้น (ไม่ highlight)
  const defaultCenter: [number, number] = [
    validEvents[0].lat!,
    validEvents[0].lng!,
  ];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
      zoomControl
    >
      {/* 🌍 Base Map */}
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
            : getEngineOnIcon(event.total_engine_on_min);

        return (
          <Marker
            key={event._id}
            position={[event.lat!, event.lng!]}
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
        );
      })}

      {/* 🔵 Active highlight */}
      {selectedEvent && (
        <>
          <Circle
            center={[selectedEvent.lat!, selectedEvent.lng!]}
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
  );
}

/* -------------------------------------------------
   👁️ AutoFocus — fly to active
------------------------------------------------- */
function AutoFocus({ activeEvent }: { activeEvent: EventData }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([activeEvent.lat!, activeEvent.lng!], 14, {
      animate: true,
      duration: 0.8,
    });
  }, [activeEvent, map]);

  return null;
}

/* -------------------------------------------------
   📊 Legend Control
------------------------------------------------- */
function Legend() {
  const map = useMap();

  useEffect(() => {
    const legend = L.control({ position: "bottomright" });

    legend.onAdd = () => {
      const div = L.DomUtil.create(
        "div",
        "bg-white p-3 rounded shadow text-xs leading-snug"
      );

      div.innerHTML = `
        <div class="font-semibold mb-1">Engine-On Level</div>
        <div>🟢 &lt; 30 นาที</div>
        <div>🟠 30–60 นาที</div>
        <div>🔴 &gt; 60 นาที 🔥</div>
        <hr class="my-1" />
        <div>⭐ Selected</div>
        <div>👁 Hover</div>
      `;

      return div;
    };

    legend.addTo(map);
    return () => legend.remove();
  }, [map]);

  return null;
}
