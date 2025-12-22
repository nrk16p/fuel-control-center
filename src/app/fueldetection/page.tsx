"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { FuelDetectionFilter } from "@/components/fueldetection/filter"
import type { FuelDetectionData } from "@/lib/types"

/* ---------------------------------------
   Types
--------------------------------------- */
export type ReviewRow = {
  _id: any
  plate: string
  start_ts: number
  end_ts: number
  decision: string
  note?: string
  reviewer?: string
  created_at?: string
  fuel_start?: number
  fuel_end?: number
  fuel_diff?: number
}

/* ---------------------------------------
   Client-only Graph (Chart.js)
   👉 updated path after refactor
--------------------------------------- */
const FuelDetectionGraph = dynamic(
  () =>
    import(
      "@/components/fueldetection/graph/FuelDetectionGraph"
    ),
  {
    ssr: false, // ✅ กัน window is not defined
    loading: () => (
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
    ),
  }
)

/* ---------------------------------------
   Page
--------------------------------------- */
export default function FuelDetectionPage() {
  const [data, setData] = useState<FuelDetectionData[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(false)

  /* ---------------------------------------
     🔍 Apply Filter
  --------------------------------------- */
  const handleQueryApply = async (filters: {
    plateDriver: string
    startDate: string
    endDate: string
    statuses: string[]
    movingOnly: boolean
    showReviewed: boolean
    showUnreviewed: boolean
  }) => {
    setLoading(true)

    try {
      const {
        plateDriver,
        startDate,
        endDate,
        statuses,
        movingOnly,
        showReviewed,
        showUnreviewed,
      } = filters

      if (!plateDriver || !startDate || !endDate) {
        setData([])
        setReviews([])
        return
      }

      /* ----------------------------
         1) Driving data
      ---------------------------- */
      const p1 = new URLSearchParams({
        plateDriver,
        startDate,
        endDate,
      })

      if (statuses.length > 0) {
        p1.append("statuses", statuses.join(","))
      }

      if (movingOnly) {
        p1.append("movingOnly", "true")
      }

      // UX: ซ่อน reviewed เฉพาะกรณี user เลือก
      if (showUnreviewed && !showReviewed) {
        p1.append("skipReviewed", "true")
      }

      const fetchDriving = fetch(
        `/api/fuel-detection?${p1.toString()}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      ).then(res => {
        if (!res.ok) throw new Error("Fetch driving data failed")
        return res.json()
      })

      /* ----------------------------
         2) Review windows
      ---------------------------- */
      const p2 = new URLSearchParams({
        plate: plateDriver,
        startDate,
        endDate,
      })

      const fetchReviews = fetch(
        `/api/fuel-reviews?${p2.toString()}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      ).then(res => {
        if (!res.ok) throw new Error("Fetch reviews failed")
        return res.json()
      })

      /* ----------------------------
         Fetch both in parallel
      ---------------------------- */
      const [drivingJson, reviewsJson] = await Promise.all([
        fetchDriving,
        fetchReviews,
      ])

      setData(drivingJson)
      setReviews(reviewsJson)
    } catch (err) {
      console.error("Fuel detection fetch error:", err)
      alert("Error fetching data")
    } finally {
      setLoading(false)
    }
  }

  /* ---------------------------------------
     Render
  --------------------------------------- */
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">
        ⛽ Fuel Detection{" "}
        <span className="text-gray-500">(Review-aware)</span>
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
        <FuelDetectionGraph
          data={data}
          reviews={reviews}
        />
      )}
    </div>
  )
}
