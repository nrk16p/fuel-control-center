"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { FuelDetectionFilter } from "@/components/fueldetection/filter"
import type { FuelDetectionData } from "@/lib/types"

/* ===============================
   ✅ Client-only Graph (สำคัญมาก)
================================ */
const FuelDetectionGraph = dynamic(
  () => import("@/components/fueldetection/graph"),
  {
    ssr: false, // 🔥 กัน window is not defined
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
  const [loading, setLoading] = useState<boolean>(false)

  const handleQueryApply = async (filters: {
    plateDriver: string
    startDate: string
    endDate: string
  }) => {
    setLoading(true)

    try {
      if (!filters.plateDriver || !filters.startDate || !filters.endDate) {
        setData([])
        return
      }

      const params = new URLSearchParams({
        plateDriver: filters.plateDriver,
        startDate: filters.startDate,
        endDate: filters.endDate,
      })

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

      const json = await res.json()
      console.log("Fetched Data:", json)
      setData(json)
    } catch (err) {
      console.error(err)
      alert("Error fetching data")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">⛽ Fuel Detection (รายคัน)</h1>

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
