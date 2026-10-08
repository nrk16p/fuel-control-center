"use client"

import "leaflet/dist/leaflet.css"
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet"

export type MapPoint = { lat: number; lng: number }

/** จุดเกิดเหตุ — CircleMarker ไม่ต้องใช้ไฟล์ไอคอนของ Leaflet */
export default function EventMap({ point }: { point: MapPoint }) {
  return (
    <MapContainer center={[point.lat, point.lng]} zoom={15} scrollWheelZoom={false} className="h-full w-full rounded-[16px]">
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[point.lat, point.lng]}
        radius={9}
        pathOptions={{ color: "#B35A36", fillColor: "#B35A36", fillOpacity: 0.6 }}
      />
    </MapContainer>
  )
}
