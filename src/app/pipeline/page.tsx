"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import utc from "dayjs/plugin/utc"
import { Button } from "@/components/ui/button"

import {
  healthz,
  engineOnStatus,
  driverCostStatus,
  vehicleMasterStatus,
  engineOnTripSummaryStatus,
} from "@/lib/etlApi"

import RunEngineOnModal from "@/components/pipeline/RunEngineOnModal"
import RunDriverCostModal from "@/components/pipeline/RunDriverCostModal"
import RunVehicleMasterModal from "@/components/pipeline/RunVehicleMasterModal"
import RunTripSummaryModal from "@/components/pipeline/RunTripSummaryModal"
import EtlJobsModal from "@/components/pipeline/EtlJobsModal"

dayjs.extend(utc)
dayjs.extend(relativeTime)

/* ---------------- Types ---------------- */

type JobType = "engineon" | "drivercost" | "vehiclemaster" | "engineon-trip-summary"
type JobStatus = "queued" | "running" | "success" | "failed"

type RunFn = () => Promise<{ job_id?: string }>

interface Job {
  localId: string
  jobId?: string
  name: string
  type: JobType
  status: JobStatus
  queuedAt: string
  startedAt?: string
  finishedAt?: string
  message?: string
}

interface QueuedJob {
  localId: string
  type: JobType
  name: string
  run: RunFn
}

/* ---------------- Page ---------------- */

export default function PipelinePage() {
  const [health, setHealth] = useState<any>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [queue, setQueue] = useState<QueuedJob[]>([])

  // modals
  const [openEngineOn, setOpenEngineOn] = useState(false)
  const [openDriverCost, setOpenDriverCost] = useState(false)
  const [openVehicleMaster, setOpenVehicleMaster] = useState(false)
  const [openTripSummary, setOpenTripSummary] = useState(false)
  const [openEtlJobs, setOpenEtlJobs] = useState(false)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const runningJob = useMemo(() => jobs.find((j) => j.status === "running"), [jobs])

  /* -------- Health -------- */
  useEffect(() => {
    healthz()
      .then(setHealth)
      .catch(() => setHealth({ status: "error" }))
  }, [])

  /* -------- Queue helper -------- */
  const enqueue = (type: JobType, name: string, run: RunFn) => {
    const localId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const now = new Date().toISOString()

    setJobs((prev) => [
      {
        localId,
        type,
        name,
        status: "queued",
        queuedAt: now,
      },
      ...prev,
    ])

    setQueue((q) => [...q, { localId, type, name, run }])
  }

  /* -------- Start next job (single runner) -------- */
  useEffect(() => {
    if (runningJob) return
    if (queue.length === 0) return

    const next = queue[0]

    ;(async () => {
      try {
        const res = await next.run()
        const jobId = res?.job_id

        // ❗ backend ไม่ส่ง job_id => ป้องกัน /status/undefined
        if (!jobId) {
          setJobs((prev) =>
            prev.map((j) =>
              j.localId === next.localId
                ? {
                    ...j,
                    status: "failed",
                    message: "Backend did not return job_id",
                    finishedAt: new Date().toISOString(),
                  }
                : j
            )
          )
          setQueue((q) => q.slice(1))
          return
        }

        setJobs((prev) =>
          prev.map((j) =>
            j.localId === next.localId
              ? {
                  ...j,
                  jobId,
                  status: "running",
                  startedAt: new Date().toISOString(),
                  message: undefined,
                }
              : j
          )
        )

        setQueue((q) => q.slice(1))
      } catch (e: any) {
        setJobs((prev) =>
          prev.map((j) =>
            j.localId === next.localId
              ? {
                  ...j,
                  status: "failed",
                  message: e?.message ?? "Failed to start",
                  finishedAt: new Date().toISOString(),
                }
              : j
          )
        )
        setQueue((q) => q.slice(1))
      }
    })()
  }, [queue, runningJob])

  /* -------- Polling running job -------- */
  useEffect(() => {
    // ✅ IMPORTANT: return type ต้องเป็น void หรือ cleanup function เท่านั้น
    if (!runningJob || !runningJob.jobId) return

    if (pollingRef.current) clearInterval(pollingRef.current)

    pollingRef.current = setInterval(async () => {
      try {
        let res: any

        switch (runningJob.type) {
          case "engineon":
            res = await engineOnStatus(runningJob.jobId!)
            break
          case "drivercost":
            res = await driverCostStatus(runningJob.jobId!)
            break
          case "vehiclemaster":
            res = await vehicleMasterStatus(runningJob.jobId!)
            break
          case "engineon-trip-summary":
            res = await engineOnTripSummaryStatus(runningJob.jobId!)
            break
        }

        if (res?.status === "success" || res?.status === "failed") {
          setJobs((prev) =>
            prev.map((j) =>
              j.localId === runningJob.localId
                ? {
                    ...j,
                    status: res.status,
                    finishedAt: res.finished_at ?? new Date().toISOString(),
                    message: res?.error ?? j.message,
                  }
                : j
            )
          )
        }
      } catch (e: any) {
        // ถ้า status endpoint พังซักพัก ไม่ต้องล้ม job ทันที แค่ปล่อยให้ poll รอบถัดไป
      }
    }, 5000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [runningJob?.jobId, runningJob?.type, runningJob?.localId])

  /* ---------------- Render ---------------- */

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold">🧭 ETL Pipeline Control</h1>
        <p className="text-sm text-gray-600">Queue based • Single runner • Auto polling</p>
      </header>

      {/* Health + ETL Jobs button (next to health) */}
      <section className="bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div className="font-semibold">
          Health:{" "}
          <span className={health?.status === "ok" ? "text-green-600" : "text-red-600"}>
            {health?.status ?? "unknown"}
          </span>
        </div>

        <Button variant="outline" onClick={() => setOpenEtlJobs(true)}>
          📄 ETL Jobs
        </Button>
      </section>

      {/* Actions */}
      <section className="grid grid-cols-2 gap-4">
        <Button onClick={() => setOpenEngineOn(true)}>🔥 Run Engine-On</Button>
        <Button onClick={() => setOpenDriverCost(true)}>💰 Driver Cost</Button>
        <Button onClick={() => setOpenVehicleMaster(true)}>🚚 Vehicle Master</Button>
        <Button onClick={() => setOpenTripSummary(true)}>📊 Trip Summary</Button>
      </section>

      {/* Timeline */}
      <section className="bg-white border rounded-xl shadow-sm">
        <div className="p-4 border-b font-semibold">📈 ETL Timeline</div>

        <ul className="divide-y">
          {jobs.map((j) => (
            <li key={j.localId} className="p-4 flex justify-between">
              <div>
                <div className="font-medium">{j.name}</div>

                <div className="text-xs text-gray-500">
                  {j.status === "queued" && `⏳ Queued ${dayjs(j.queuedAt).fromNow()}`}
                  {j.status !== "queued" && j.startedAt && `Started ${dayjs(j.startedAt).fromNow()}`}
                  {j.finishedAt && ` • Finished ${dayjs(j.finishedAt).fromNow()}`}
                </div>

                {j.jobId && <div className="text-[11px] text-gray-400">job_id: {j.jobId}</div>}

                {j.message && <div className="text-xs text-red-600 mt-1">{j.message}</div>}
              </div>

              <StatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      </section>

      {/* Modals (ส่ง run fn เข้า queue) */}
      <RunEngineOnModal
        open={openEngineOn}
        onClose={() => setOpenEngineOn(false)}
        onQueue={(run) => enqueue("engineon", "Engine-On ETL", run)}
      />

      <RunDriverCostModal
        open={openDriverCost}
        onClose={() => setOpenDriverCost(false)}
        onQueue={(run) => enqueue("drivercost", "Driver Cost ETL", run)}
      />

      <RunVehicleMasterModal
        open={openVehicleMaster}
        onClose={() => setOpenVehicleMaster(false)}
        onQueue={(run) => enqueue("vehiclemaster", "Vehicle Master ETL", run)}
      />

      <RunTripSummaryModal
        open={openTripSummary}
        onClose={() => setOpenTripSummary(false)}
        onQueue={(run) => enqueue("engineon-trip-summary", "Engine-On Trip Summary", run)}
      />

      <EtlJobsModal open={openEtlJobs} onClose={() => setOpenEtlJobs(false)} />
    </div>
  )
}

/* ---------------- Badge ---------------- */

function StatusBadge({ status }: { status: JobStatus }) {
  if (status === "queued") return <span className="text-gray-500">⏳ Queued</span>
  if (status === "running") return <span className="text-yellow-600">🟡 Running</span>
  if (status === "success") return <span className="text-green-600">🟢 Success</span>
  return <span className="text-red-600">🔴 Failed</span>
}
