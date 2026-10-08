"use client"

import { useEffect, useState } from "react"
import dayjs from "dayjs"
import { Button } from "@/components/ui/button"
import { JOBS, formatDuration, type JobDef } from "@/lib/pipeline-jobs"
import RunJobModal, { type QueueFn } from "./RunJobModal"

interface EtlRun {
  _id: string
  status: string
  start_time?: string
  duration_sec?: number | null
  records?: number
  error?: string | null
}

/** งานประจำ tab: one card per scheduled job — schedule (read-only), last 5 runs, Run → parameter form. */
export default function JobsTab({ onQueue, refreshKey }: { onQueue: QueueFn; refreshKey: number }) {
  const [openJob, setOpenJob] = useState<JobDef | null>(null)

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {JOBS.map((job) => (
        <article key={job.type} className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">{job.name}</h3>
              <p className="text-sm text-gray-600">{job.description}</p>
              <p className="mt-1 text-xs text-gray-500">🕒 {job.schedule}</p>
            </div>
            <Button onClick={() => setOpenJob(job)}>▶ Run</Button>
          </div>
          <RecentRuns jobType={job.ncacType} refreshKey={refreshKey} />
        </article>
      ))}

      {openJob && (
        <RunJobModal key={openJob.type} job={openJob} onClose={() => setOpenJob(null)} onQueue={onQueue} />
      )}
    </section>
  )
}

/** Last 5 etl_jobs rows of one pipeline; refetched whenever a queued run finishes (refreshKey). */
function RecentRuns({ jobType, refreshKey }: { jobType: string; refreshKey: number }) {
  const [runs, setRuns] = useState<EtlRun[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/etl_jobs?job_type=${encodeURIComponent(jobType)}&limit=5`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (alive) setRuns(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (alive) setRuns([])
      })
    return () => {
      alive = false
    }
  }, [jobType, refreshKey])

  if (runs === null) return <p className="text-xs text-gray-400">กำลังโหลดประวัติ…</p>
  if (runs.length === 0) return <p className="text-xs text-gray-400">ยังไม่มีประวัติการรัน</p>

  return (
    <table className="w-full text-xs">
      <thead className="text-gray-500">
        <tr>
          <th className="text-left font-normal">ผล</th>
          <th className="text-left font-normal">เริ่ม</th>
          <th className="text-left font-normal">ใช้เวลา</th>
          <th className="text-right font-normal">records</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r._id} className="border-t">
            <td className="py-1" title={r.error ?? undefined}>
              <RunStatus status={r.status} />
              {r.error ? " ⓘ" : ""}
            </td>
            <td>{r.start_time ? dayjs(r.start_time).format("DD/MM HH:mm") : "-"}</td>
            <td>{formatDuration(r.duration_sec)}</td>
            <td className="text-right">{typeof r.records === "number" ? r.records.toLocaleString() : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RunStatus({ status }: { status: string }) {
  if (status === "success") return <span className="text-green-600">🟢 สำเร็จ</span>
  if (status === "running") return <span className="text-yellow-600">🟡 กำลังรัน</span>
  return <span className="text-red-600">🔴 ล้มเหลว</span>
}
