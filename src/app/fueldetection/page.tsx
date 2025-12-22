"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { FuelDetectionFilter } from "@/components/fueldetection/filter"
import type { FuelDetectionData } from "@/lib/types"

/* ===============================
   ✅ Client-only Graph
================================ */
const FuelDetectionGraph = dynamic(
  () => import("@/components/fueldetection/graph"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="h-5 w-48 rounded bg-gray-200 mb-4 animate-pulse" />
        <div className="flex items-end gap-3 h-64">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-full rounded bg-gray-200 animate-pulse"
              style={{ height: `${30 + (i % 5) * 15}%` }}
            />
          ))}
        </div>
      </div>
    ),
  }
)

export default function FuelDetectionPage() {
  const [data, setData] = useState<FuelDetectionData[]>([])
  const [loading, setLoading] = useState(false)

  /* --------------------------------------------------
     🔍 Receive FULL filter from Filter component
  -------------------------------------------------- */
  const handleQueryApply = async (filters: {
    plateDriver: string
    startDate: string
    endDate: string
    status: string
    movingOnly: boolean
  }) => {
    setLoading(true)

    try {
      const {
        plateDriver,
        startDate,
        endDate,
        status,
        movingOnly,
      } = filters

      if (!plateDriver || !startDate || !endDate) {
        setData([])
        return
      }

      /* ---------------- Build query params ---------------- */
      const params = new URLSearchParams({
        plateDriver,
        startDate,
        endDate,
      })

      if (status && status !== "all") {
        params.append("status", status)
      }

      if (movingOnly) {
        params.append("movingOnly", "true")
      }

      /* ---------------- Fetch ---------------- */
      const res = await fetch(
        `/api/fuel-detection?${params.toString()}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      )

      if (!res.ok) {
        throw new Error("Failed to fetch fuel detection data")
      }

      const json: FuelDetectionData[] = await res.json()
      console.log("Fetched Data:", {
        count: json.length,
        sample: json.slice(0, 3),
      })

      setData(json)
    } catch (err) {
      console.error("Fuel detection fetch error:", err)
      alert("Error fetching data")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">
        ⛽ Fuel Detection <span className="text-gray-500">(รายคัน)</span>
      </h1>

      {/* 🔍 Filter */}
      <FuelDetectionFilter
        query={handleQueryApply}
        isLoading={loading}
      />

      {/* 📊 Graph */}
      {loading ? (
        <div className="rounded-xl border bg-white p-6 shadow-sm animate-pulse">
          <div className="h-5 w-48 rounded bg-gray-200 mb-4" />
          <div className="flex items-end gap-3 h-64">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="w-full rounded bg-gray-200"
                style={{ height: `${30 + (i % 5) * 15}%` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <FuelDetectionGraph data={data} />
      )}
    </div>
  )
}
