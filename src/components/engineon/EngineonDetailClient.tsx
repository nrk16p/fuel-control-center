"use client"

import { useState, useMemo, useEffect } from "react"
import EngineonMapClient from "@/components/engineon/EngineonMapClient"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import "dayjs/locale/th"

dayjs.extend(utc)
dayjs.locale("th")

/* -------------------------------------------------
   📦 Types
------------------------------------------------- */
export interface RawEngineonData {
  _id: string
  date?: string
  count_records?: number
  total_engine_on_hr?: number
  total_engine_on_min?: number
  version_type?: string
  ทะเบียนพาหนะ?: string
  สถานที่?: string
  start_time?: string
  end_time?: string
  lat?: number
  lng?: number
  event_id?: number
  nearest_plant?: string | null
}

/* -------------------------------------------------
   🔐 Helpers (SAFE)
------------------------------------------------- */
const fmt = (v?: number | null, d = 2) =>
  Number(v ?? 0).toFixed(d)

const safeDate = (v?: string, f = "DD/MM/YYYY") =>
  v ? dayjs.utc(v).format(f) : "-"

function engineOnLevel(min?: number): "red" | "orange" | "green" {
  const v = Number(min ?? 0)
  if (v > 60) return "red"
  if (v >= 30) return "orange"
  return "green"
}

function engineOnColor(min?: number): string {
  const v = Number(min ?? 0)
  if (v > 60) return "text-red-600"
  if (v >= 30) return "text-orange-600"
  return "text-green-600"
}

/* -------------------------------------------------
   🧩 Component
------------------------------------------------- */
export default function EngineonDetailClient({
  events,
}: {
  events: RawEngineonData[]
}) {
  /* ───── Guard: no data ───── */
  if (!events || events.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        No engine-on data available
      </div>
    )
  }

  const [plantFilter, setPlantFilter] = useState<string>("all")
  const [selected, setSelected] = useState<RawEngineonData>(events[0])
  const [hoverId, setHoverId] = useState<string | null>(null)

  /* 🌱 Unique plant list */
  const plants = useMemo(() => {
    const unique = new Set(events.map(e => e.nearest_plant ?? "Unknown"))
    return ["all", ...Array.from(unique)]
  }, [events])

  /* 🔍 Filtered events */
  const filteredEvents = useMemo(() => {
    if (plantFilter === "all") return events
    return events.filter(e => e.nearest_plant === plantFilter)
  }, [events, plantFilter])

  /* 🔄 Keep selected valid */
  useEffect(() => {
    const valid = filteredEvents.find(e => e._id === selected?._id)
    if (!valid && filteredEvents.length > 0) {
      setSelected(filteredEvents[0])
    }
  }, [filteredEvents, selected])

  /* 📊 Summary badge */
  const summary = useMemo(() => {
    let red = 0
    let orange = 0
    let green = 0

    filteredEvents.forEach(e => {
      const min = Number(e.total_engine_on_min ?? 0)
      if (min > 60) red++
      else if (min >= 30) orange++
      else green++
    })

    return { red, orange, green }
  }, [filteredEvents])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ───────────────── Sidebar ───────────────── */}
      <aside className="w-full md:w-[38%] lg:w-[30%] xl:w-[28%] bg-white border-r shadow-sm overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <header className="sticky top-0 bg-white pb-2 border-b z-10">
          <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
            Engine-On Details <Badge variant="secondary">v2</Badge>
          </h1>

          <p className="text-sm text-gray-600">
            🚚 ทะเบียนรถ{" "}
            <span className="font-semibold text-blue-600">
              {selected.ทะเบียนพาหนะ ?? "-"}
            </span>
          </p>

          <p className="text-xs text-gray-400">
            Showing {filteredEvents.length} event
            {filteredEvents.length !== 1 && "s"}
          </p>

          <div className="flex gap-2 mt-2">
            <Badge className="bg-red-100 text-red-700">🔴 {summary.red}</Badge>
            <Badge className="bg-orange-100 text-orange-700">
              🟠 {summary.orange}
            </Badge>
            <Badge className="bg-green-100 text-green-700">
              🟢 {summary.green}
            </Badge>
          </div>
        </header>

        {/* Filter */}
        <section>
          <label className="text-xs font-semibold text-gray-600">
            Filter by Nearest Plant
          </label>
          <Select value={plantFilter} onValueChange={setPlantFilter}>
            <SelectTrigger className="w-full mt-1 text-sm">
              <SelectValue placeholder="Select a plant" />
            </SelectTrigger>
            <SelectContent>
              {plants.map(p => (
                <SelectItem key={p} value={p}>
                  {p === "all" ? "All Plants" : p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* Detail Info */}
        <section className="space-y-3 text-sm border-b pb-4">
          <Info label="วันที่" value={safeDate(selected.date)} />
          <Info label="Records" value={selected.count_records ?? 0} />
          <Info label="Engine-On (ชม.)" value={fmt(selected.total_engine_on_hr)} />
          <Info label="Engine-On (นาที)" value={fmt(selected.total_engine_on_min)} />
          <Info
            label="Start Time"
            value={safeDate(selected.start_time, "DD/MM/YYYY HH:mm:ss")}
          />
          <Info
            label="End Time"
            value={safeDate(selected.end_time, "DD/MM/YYYY HH:mm:ss")}
          />
          <Info label="สถานที่" value={selected.สถานที่ ?? "-"} />
          <Info label="Nearest Plant" value={selected.nearest_plant ?? "-"} />

          <div className="flex gap-2">
            <Badge variant="outline">Lat {fmt(selected.lat, 6)}</Badge>
            <Badge variant="outline">Lng {fmt(selected.lng, 6)}</Badge>
          </div>
        </section>

        {/* Back */}
        <a
          href="/engineon"
          className="inline-flex items-center justify-center w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          ← Back to Table
        </a>

        {/* All Events */}
        <section className="pt-4">
          <p className="text-xs font-semibold mb-2">All Events</p>
          <ul className="space-y-1">
            {filteredEvents.map(ev => (
              <li
                key={ev._id}
                onClick={() => setSelected(ev)}
                onMouseEnter={() => setHoverId(ev._id)}
                onMouseLeave={() => setHoverId(null)}
                className={`cursor-pointer text-xs px-2 py-2 rounded ${
                  ev._id === selected._id
                    ? "bg-blue-100 text-blue-700 font-semibold"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-between">
                  <span>#{ev.event_id ?? "–"}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      engineOnColor(ev.total_engine_on_min)
                    }`}
                  >
                    {ev.nearest_plant ?? "-"}
                  </Badge>
                </div>

                <div className={engineOnColor(ev.total_engine_on_min)}>
                  {safeDate(ev.start_time, "HH:mm:ss")} →{" "}
                  {safeDate(ev.end_time, "HH:mm:ss")} (
                  {fmt(ev.total_engine_on_min, 1)} min
                  {Number(ev.total_engine_on_min ?? 0) > 60 && " 🔥"})
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {/* ───────────────── Map ───────────────── */}
      <main className="flex-1 relative">
        {filteredEvents.length > 0 && selected && (
          <EngineonMapClient
            events={filteredEvents}
            activeId={selected._id}
            hoverId={hoverId}
          />
        )}
      </main>
    </div>
  )
}

/* -------------------------------------------------
   ℹ️ Info Row
------------------------------------------------- */
function Info({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-500 text-[10px] uppercase">
        {label}
      </span>
      <span className="font-medium text-sm">
        {value}
      </span>
    </div>
  )
}
