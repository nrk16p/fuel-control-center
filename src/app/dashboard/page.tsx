"use client"

export default function DashboardPage() {
  return (
    <main className="space-y-6 p-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-64 rounded bg-gray-200" />
        <div className="h-4 w-96 rounded bg-gray-100" />
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="h-4 w-24 rounded bg-gray-200 mb-3" />
            <div className="h-7 w-32 rounded bg-gray-300" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
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

      {/* Table skeleton */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="h-5 w-40 rounded bg-gray-200 mb-4" />
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="mb-3 grid grid-cols-5 gap-4 last:mb-0"
          >
            {[...Array(5)].map((__, j) => (
              <div
                key={j}
                className="h-4 rounded bg-gray-100"
              />
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}
