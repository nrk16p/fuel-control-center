"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import "leaflet/dist/leaflet.css"

/* ===============================
   Dynamic Leaflet Components
================================ */
const MapContainer = dynamic(
  () => import("react-leaflet").then(m => m.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import("react-leaflet").then(m => m.TileLayer),
  { ssr: false }
)
const Polyline = dynamic(
  () => import("react-leaflet").then(m => m.Polyline),
  { ssr: false }
)
const Marker = dynamic(
  () => import("react-leaflet").then(m => m.Marker),
  { ssr: false }
)
const Circle = dynamic(
  () => import("react-leaflet").then(m => m.Circle),
  { ssr: false }
)

/* ===============================
   Types
================================ */
type GeoFeature = {
  geometry: {
    type: "LineString"
    coordinates: number[][]
  }
  properties: {
    plant?: [number, number]
    site?: [number, number]
    timestamps?: string[]
  }
}

type GeoJSONData = {
  type: "FeatureCollection"
  features: GeoFeature[]
}

/* ===============================
   Helpers
================================ */
function fmtTime(ts?: string) {
  if (!ts) return "-"
  const d = new Date(ts)
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString("th-TH", { hour12: false })
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/* ===============================
   Page
================================ */
export default function SmartDistanceMapPage() {
  const { TicketNo } = useParams<{ TicketNo: string }>()

  const [geojson, setGeojson] = useState<GeoJSONData | null>(null)
  const [loading, setLoading] = useState(true)

  const [showP2S, setShowP2S] = useState(true)
  const [showS2P, setShowS2P] = useState(true)

  const [zoom, setZoom] = useState(13)

  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(800)

  const leafletRef = useRef<any>(null)

  /* ---------- Load Leaflet + plugin ---------- */
  useEffect(() => {
    let mounted = true
    async function load() {
      if (typeof window === "undefined") return
      const L = (await import("leaflet")).default
      await import("leaflet-textpath")
      if (mounted) leafletRef.current = L
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  /* ---------- Fetch geo ---------- */
  useEffect(() => {
    setLoading(true)
    setGeojson(null)
    setCursor(0)
    setPlaying(false)

    fetch(`/api/raw-smartdistance?TicketNo=${TicketNo}`)
      .then(r => r.json())
      .then(setGeojson)
      .catch(() => setGeojson(null))
      .finally(() => setLoading(false))
  }, [TicketNo])

  const feature = geojson?.features?.[0]
  const coords = feature?.geometry.coordinates ?? []
  const plant = feature?.properties.plant
  const site = feature?.properties.site
  const timestamps = feature?.properties.timestamps ?? []

  useEffect(() => {
    if (!coords.length) return
    setCursor(c => clamp(c, 0, coords.length - 1))
  }, [coords.length])

  const center = useMemo<[number, number]>(() => {
    if (!coords.length) return [13.7, 100.6]
    const mid = coords[Math.floor(coords.length / 2)]
    return [mid[1], mid[0]]
  }, [coords])

  const splitIndex = Math.floor(coords.length / 2)
  const p2s = coords.slice(0, splitIndex)
  const s2p = coords.slice(splitIndex)

  const activeP2S = useMemo(
    () => p2s.slice(0, clamp(cursor + 1, 0, p2s.length)),
    [p2s, cursor]
  )

  const activeS2P = useMemo(() => {
    const rel = cursor - splitIndex
    if (rel < 0) return []
    return s2p.slice(0, clamp(rel + 1, 0, s2p.length))
  }, [s2p, cursor, splitIndex])

  const currentPosition = useMemo<[number, number] | null>(() => {
    if (!coords[cursor]) return null
    const [lng, lat] = coords[cursor]
    return [lat, lng]
  }, [coords, cursor])

  /* ---------- Playback ---------- */
  useEffect(() => {
    if (!playing || coords.length < 2) return
    const id = window.setInterval(() => {
      setCursor(c => (c >= coords.length - 1 ? c : c + 1))
    }, speedMs)
    return () => clearInterval(id)
  }, [playing, coords.length, speedMs])

  /* ---------- Arrow ---------- */
  const applyArrow = (polyline: any, color: string) => {
    const L = leafletRef.current
    if (!L || zoom < 12 || typeof polyline.setText !== "function") return
    polyline.setText(null)
    polyline.setText(" ▶ ", {
      repeat: true,
      offset: 12,
      attributes: {
        fill: color,
        "font-size": "14px",
        "font-weight": "bold",
      },
    })
  }

  /* ---------- Icons ---------- */
  const makeIcon = (emoji: string) =>
    leafletRef.current?.divIcon({
      html: emoji,
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })

  const plantIcon = useMemo(() => makeIcon("🏭"), [leafletRef.current])
  const siteIcon = useMemo(() => makeIcon("📍"), [leafletRef.current])
  const truckIcon = useMemo(() => makeIcon("🚚"), [leafletRef.current])

  /* ===============================
     Render
================================ */
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>🗺️ Smart Distance – {TicketNo}</CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-gray-500">Loading…</div>
          ) : !feature ? (
            <div className="text-gray-500">No data</div>
          ) : (
            <>
              <MapContainer
                center={center}
                zoom={zoom}
                whenReady={e => {
                  const map = e.target
                  map.on("zoomend", () => setZoom(map.getZoom()))
                }}
                style={{ height: "70vh", width: "100%" }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {showP2S && activeP2S.length > 1 && (
                  <Polyline
                    positions={activeP2S.map(([lng, lat]) => [lat, lng])}
                    pathOptions={{ color: "#2563eb", weight: 5 }}
                    eventHandlers={{ add: e => applyArrow(e.target, "#2563eb") }}
                  />
                )}

                {showS2P && activeS2P.length > 1 && (
                  <Polyline
                    positions={activeS2P.map(([lng, lat]) => [lat, lng])}
                    pathOptions={{ color: "#16a34a", weight: 5, dashArray: "6 6" }}
                    eventHandlers={{ add: e => applyArrow(e.target, "#16a34a") }}
                  />
                )}

                {currentPosition && truckIcon && (
                  <Marker position={currentPosition} icon={truckIcon} />
                )}

                {plant && plantIcon && (
                  <>
                    <Marker position={[plant[1], plant[0]]} icon={plantIcon} />
                    <Circle center={[plant[1], plant[0]]} radius={200} />
                  </>
                )}

                {site && siteIcon && (
                  <>
                    <Marker position={[site[1], site[0]]} icon={siteIcon} />
                    <Circle center={[site[1], site[0]]} radius={200} />
                  </>
                )}
              </MapContainer>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
