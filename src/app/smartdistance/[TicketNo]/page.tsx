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
    plant?: [number, number] // [lng, lat]
    site?: [number, number] // [lng, lat]
    logic_version?: string
    timestamps?: string[] // ✅ per-point time (ISO)
    TicketNo?: string
    TruckPlateNo?: string
    PlantCode?: string
    SiteCode?: string
    loop_start_at?: string
    loop_end_at?: string
  }
}

type GeoJSONData = {
  type: "FeatureCollection"
  features: GeoFeature[]
}

/* ===============================
   Small helpers
================================ */
function fmtTime(ts?: string) {
  if (!ts) return "-"
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString("th-TH", { hour12: false })
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

  // zoom state for arrow rendering
  const [zoom, setZoom] = useState(13)

  // replay states
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(800) // frame step (ms)

  // Leaflet ref (client only)
  const LRef = useRef<any>(null)

  /* ---------- Load Leaflet + plugin (client only) ---------- */
  useEffect(() => {
    let mounted = true
    async function loadLeaflet() {
      if (typeof window === "undefined") return
      const L = (await import("leaflet")).default
      await import("leaflet-textpath")
      if (mounted) LRef.current = L
    }
    loadLeaflet()
    return () => {
      mounted = false
    }
  }, [])

  /* ---------- Fetch geo data ---------- */
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

  /* ---------- Safe access ---------- */
  const feature = geojson?.features?.[0]
  const coords = feature?.geometry.coordinates ?? []
  const plant = feature?.properties.plant
  const site = feature?.properties.site

  const timestamps = feature?.properties.timestamps ?? []

  // normalize time once
  const timePoints = useMemo(() => {
    return timestamps.map(t => new Date(t).getTime())
  }, [timestamps])

  // keep cursor in range if data changes
  useEffect(() => {
    if (!coords.length) return
    setCursor(c => clamp(c, 0, coords.length - 1))
  }, [coords.length])

  /* ---------- Center ---------- */
  const center = useMemo<[number, number]>(() => {
    if (!coords.length) return [13.7, 100.6]
    const mid = coords[Math.floor(coords.length / 2)]
    return [mid[1], mid[0]]
  }, [coords])

  /* ---------- Split route ----------
     NOTE: split by first time we are near SITE radius is best,
     but for now keep simple: half split (as your original).
     You can upgrade later using state/timestamps.
  ---------------------------------- */
  const splitIndex = Math.floor(coords.length / 2)
  const p2s = coords.slice(0, splitIndex)
  const s2p = coords.slice(splitIndex)

  /* ---------- Progressive lines for replay ---------- */
  const activeLine = useMemo(() => {
    if (!coords.length) return []
    return coords.slice(0, cursor + 1)
  }, [coords, cursor])

  const activeP2S = useMemo(() => {
    const end = clamp(cursor + 1, 0, p2s.length)
    return p2s.slice(0, end)
  }, [p2s, cursor])

  const activeS2P = useMemo(() => {
    // when cursor passes splitIndex, reveal S2P
    const rel = cursor - splitIndex
    if (rel < 0) return []
    const end = clamp(rel + 1, 0, s2p.length)
    return s2p.slice(0, end)
  }, [s2p, cursor, splitIndex])

  /* ---------- Current position ---------- */
  const currentPosition = useMemo<[number, number] | null>(() => {
    if (!coords[cursor]) return null
    const [lng, lat] = coords[cursor]
    return [lat, lng]
  }, [coords, cursor])

  const currentTs = timestamps[cursor]
  const startTs = timestamps[0]
  const endTs = timestamps[timestamps.length - 1]

  /* ---------- Playback engine ---------- */
  useEffect(() => {
    if (!playing) return
    if (coords.length < 2) return

    const id = window.setInterval(() => {
      setCursor(c => {
        if (c >= coords.length - 1) {
          setPlaying(false)
          return c
        }
        return c + 1
      })
    }, speedMs)

    return () => window.clearInterval(id)
  }, [playing, coords.length, speedMs])

  /* ---------- Arrow helper ---------- */
  const applyArrow = (polyline: any, color: string) => {
    if (!LRef.current) return
    if (zoom < 12) return
    if (typeof polyline.setText !== "function") return

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

  /* ---------- Emoji Icons ---------- */
  const plantIcon = useMemo(() => {
    const L = LRef.current
    if (!L) return undefined
    return L.divIcon({
      html: "🏭",
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }, [LRef.current])

  const siteIcon = useMemo(() => {
    const L = LRef.current
    if (!L) return undefined
    return L.divIcon({
      html: "📍",
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }, [LRef.current])

  const truckIcon = useMemo(() => {
    const L = LRef.current
    if (!L) return undefined
    return L.divIcon({
      html: "🚚",
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }, [LRef.current])

  const hasTime = timestamps.length === coords.length && timestamps.length > 0

  /* ===============================
     Render
================================ */
  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>🗺️ Smart Distance – {TicketNo}</CardTitle>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={showP2S ? "default" : "outline"}
              onClick={() => setShowP2S(v => !v)}
            >
              Plant → Site
            </Button>
            <Button
              size="sm"
              variant={showS2P ? "default" : "outline"}
              onClick={() => setShowS2P(v => !v)}
            >
              Site → Plant
            </Button>

            <Button
              size="sm"
              variant={playing ? "default" : "outline"}
              onClick={() => setPlaying(p => !p)}
              disabled={!coords.length}
            >
              {playing ? "⏸ Pause" : "▶️ Play"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPlaying(false)
                setCursor(0)
              }}
              disabled={!coords.length}
            >
              ⟲ Reset
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-gray-500">Loading map…</div>
          ) : !feature ? (
            <div className="text-gray-500">No geo data</div>
          ) : (
            <>
              {/* ---------- Timeline / Slider ---------- */}
              <div className="mb-4 space-y-2">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Start:</span> {fmtTime(startTs)}{" "}
                    <span className="mx-2">•</span>
                    <span className="font-medium">Now:</span> {fmtTime(currentTs)}{" "}
                    <span className="mx-2">•</span>
                    <span className="font-medium">End:</span> {fmtTime(endTs)}
                  </div>

                  <div className="text-xs text-gray-600">
                    Point <span className="font-medium">{cursor + 1}</span> /{" "}
                    {coords.length}
                    {!hasTime && (
                      <span className="ml-2 text-orange-600">
                        (no timestamps)
                      </span>
                    )}
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={Math.max(0, coords.length - 1)}
                  value={cursor}
                  onChange={e => {
                    setPlaying(false)
                    setCursor(Number(e.target.value))
                  }}
                  className="w-full"
                />

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Speed</span>
                  <input
                    type="range"
                    min={150}
                    max={2000}
                    step={50}
                    value={speedMs}
                    onChange={e => setSpeedMs(Number(e.target.value))}
                    className="w-56"
                  />
                  <span className="text-xs text-gray-600">{speedMs}ms</span>
                </div>
              </div>

              {/* ---------- Map ---------- */}
              <MapContainer
                key={TicketNo}
                center={center}
                zoom={zoom}
                whenCreated={map =>
                  map.on("zoomend", () => setZoom(map.getZoom()))
                }
                style={{ height: "70vh", width: "100%" }}
              >
                <TileLayer
                  attribution="© OpenStreetMap"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Progressive: show only up to cursor */}
                {showP2S && activeP2S.length > 1 && (
                  <Polyline
                    positions={activeP2S.map(([lng, lat]) => [lat, lng])}
                    pathOptions={{ color: "#2563eb", weight: 5 }}
                    eventHandlers={{
                      add: e => applyArrow(e.target, "#2563eb"),
                    }}
                  />
                )}

                {showS2P && activeS2P.length > 1 && (
                  <Polyline
                    positions={activeS2P.map(([lng, lat]) => [lat, lng])}
                    pathOptions={{
                      color: "#16a34a",
                      weight: 5,
                      dashArray: "6 6",
                    }}
                    eventHandlers={{
                      add: e => applyArrow(e.target, "#16a34a"),
                    }}
                  />
                )}

                {/* Current truck marker */}
                {currentPosition && truckIcon && (
                  <Marker position={currentPosition} icon={truckIcon} />
                )}

                {plant && plantIcon && (
                  <>
                    <Marker position={[plant[1], plant[0]]} icon={plantIcon} />
                    <Circle
                      center={[plant[1], plant[0]]}
                      radius={200}
                      pathOptions={{ color: "#16a34a" }}
                    />
                  </>
                )}

                {site && siteIcon && (
                  <>
                    <Marker position={[site[1], site[0]]} icon={siteIcon} />
                    <Circle
                      center={[site[1], site[0]]}
                      radius={200}
                      pathOptions={{ color: "#f97316" }}
                    />
                  </>
                )}
              </MapContainer>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-600">
                <span>🔵 Plant → Site</span>
                <span>🟢 Site → Plant</span>
                <span>🏭 Plant (200m)</span>
                <span>📍 Site (200m)</span>
                <span>🚚 Current position</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
