"use client"

import { useState, useMemo } from "react"
import EngineonMapClient from "@/components/engineon/EngineonMapClient"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import dayjs from "dayjs"
import "dayjs/locale/th"

interface RawEngineonData {
  _id: string
  date: string
  count_records: number
  total_engine_on_hr: number
  total_engine_on_min: number
  version_type: string
  ทะเบียนพาหนะ: string
  สถานที่?: string
  start_time?: string
  end_time?: string
  lat?: number
  lng?: number
  event_id?: number
  nearest_plant?: string | null
}

export default function EngineonDetailClient({ events }: { events: RawEngineonData[] }) {
  const [selected, setSelected] = useState<RawEngineonData>(events[0])
  const [plantFilter, setPlantFilter] = useState<string>("all")

  // 🌱 Unique list of plants
  const plants = useMemo(() => {
    const unique = new Set(events.map((e) => e.nearest_plant ?? "Unknown"))
    return ["all", ...Array.from(unique)]
  }, [events])

  // 🔍 Filtered events
  const filteredEvents = useMemo(() => {
    if (plantFilter === "all") return events
    return events.filter((e) => e.nearest_plant === plantFilter)
  }, [events, plantFilter])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 🧾 Sidebar */}
      <aside className="w-full md:w-[38%] lg:w-[30%] xl:w-[28%] bg-white border-r shadow-sm overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <header className="sticky top-0 bg-white pb-2 border-b">
          <h1 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            Engine-On Details <Badge variant="secondary">v2</Badge>
          </h1>
          <p className="text-sm text-gray-600">
            รถ <span className="font-semibold text-blue-600">{selected["ทะเบียนพาหนะ"]}</span>
          </p>
          <p className="text-xs text-gray-400">
            Showing {filteredEvents.length} event{filteredEvents.length > 1 ? "s" : ""}
          </p>
        </header>

        {/* 🧩 Filter */}
        <section className="pt-2">
          <label className="text-xs font-semibold text-gray-600">Filter by Nearest Plant</label>
          <Select value={plantFilter} onValueChange={setPlantFilter}>
            <SelectTrigger className="w-full mt-1 text-sm">
              <SelectValue placeholder="Select a plant" />
            </SelectTrigger>
            <SelectContent>
              {plants.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === "all" ? "All Plants" : p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* 📋 Detail Info */}
        <section className="space-y-3 text-sm border-b pb-4">
          <Info label="วันที่" value={dayjs(selected.date).locale("th").format("DD/MM/YYYY")} />
          <Info label="Records" value={selected.count_records} />
          <Info label="Engine-On (ชม.)" value={selected.total_engine_on_hr.toFixed(2)} />
          <Info label="Engine-On (นาที)" value={selected.total_engine_on_min.toFixed(2)} />
          <Info
            label="Start Time"
            value={
              selected.start_time
                ? dayjs(selected.start_time).locale("th").format("DD/MM/YYYY:HH:mm:ss")

                : "-"
            }
          />
          <Info
            label="End Time"
            value={
              selected.end_time
                ? dayjs(selected.end_time).locale("th").format("DD/MM/YYYY:HH:mm:ss")

                : "-"
            }
          />
          <Info label="สถานที่" value={selected.สถานที่ ?? "-"} />
          <Info label="Nearest Plant" value={selected.nearest_plant ?? "-"} />
          <div className="flex gap-2">
            <Badge variant="outline">Lat {selected.lat?.toFixed(6) ?? "-"}</Badge>
            <Badge variant="outline">Lng {selected.lng?.toFixed(6) ?? "-"}</Badge>
          </div>
        </section>

        {/* 🔙 Back Button */}
        <div className="pt-4">
          <a
            href="/engineon"
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            ← Back to Table
          </a>
        </div>

        {/* 🧾 All Events List */}
        <section className="pt-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">All Events</p>
          <ul className="space-y-1">
            {filteredEvents.map((ev) => (
              <li
                key={ev._id}
                onClick={() => setSelected(ev)}
                className={`cursor-pointer text-xs px-2 py-2 rounded transition ${
                  ev._id === selected._id
                    ? "bg-blue-100 text-blue-700 font-semibold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">#{ev.event_id ?? "–"}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {ev.nearest_plant ?? "-"}
                  </Badge>
                </div>
                <div>
                  {dayjs(ev.start_time).format("HH:mm:ss")} →{" "}
                  {dayjs(ev.end_time).format("HH:mm:ss")} ({ev.total_engine_on_min.toFixed(1)} min)
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {/* 🗺️ Map Section */}
      <main className="flex-1 relative">
        <EngineonMapClient events={filteredEvents} selectedId={selected._id} />
      </main>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</span>
      <span className="font-medium text-gray-900 text-sm break-words">{value}</span>
    </div>
  )
}
