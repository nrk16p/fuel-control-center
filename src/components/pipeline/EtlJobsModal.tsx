"use client"

import { useEffect, useState } from "react"
import dayjs from "dayjs"
import { Button } from "@/components/ui/button"

interface EtlJob {
  _id: string
  job_type: string
  status: "running" | "success" | "failed"
  year?: number
  month?: number
  start_time?: string
  end_time?: string
  duration_sec?: number
  records?: number
  error?: string | null
}

export default function EtlJobsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [jobs, setJobs] = useState<EtlJob[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    fetch("/api/etl_jobs")
      .then((r) => r.json())
      .then(setJobs)
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-lg">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold text-lg">📄 ETL Jobs</h2>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[70vh] overflow-auto">
          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border">Job Type</th>
                  <th className="p-2 border">Status</th>
                  <th className="p-2 border">Period</th>
                  <th className="p-2 border">Records</th>
                  <th className="p-2 border">Started</th>
                  <th className="p-2 border">Ended</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j._id} className="hover:bg-gray-50">
                    <td className="p-2 border">{j.job_type}</td>
                    <td className="p-2 border">
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="p-2 border">
                      {j.year && j.month
                        ? `${j.year}-${String(j.month).padStart(2, "0")}`
                        : "-"}
                    </td>
                    <td className="p-2 border text-right">
                      {j.records?.toLocaleString() ?? "-"}
                    </td>
                    <td className="p-2 border">
                      {j.start_time
                        ? dayjs(j.start_time).format("DD/MM/YYYY HH:mm")
                        : "-"}
                    </td>
                    <td className="p-2 border">
                      {j.end_time
                        ? dayjs(j.end_time).format("DD/MM/YYYY HH:mm")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Badge ---------- */
function StatusBadge({ status }: { status: string }) {
  if (status === "success")
    return <span className="text-green-600">🟢 Success</span>
  if (status === "running")
    return <span className="text-yellow-600">🟡 Running</span>
  return <span className="text-red-600">🔴 Failed</span>
}
