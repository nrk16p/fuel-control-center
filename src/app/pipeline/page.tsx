"use client"

import { useEffect, useRef, useState } from "react"
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

type JobType =
  | "engineon"
  | "drivercost"
  | "vehiclemaster"
  | "engineon-trip-summary"

type JobStatus = "queued" | "running" | "success" | "failed"

interface Job {
  jobId?: string
  name: string
  type: JobType
  status: JobStatus
  startedAt?: string
  finishedAt?: string
  message?: string
}

interface QueuedJob {
  type: JobType
  name: string
  run: () => Promise<{ job_id?: string }>
}

/* ---------------- Page ---------------- */

export default function PipelinePage() {
  const [health, setHealth] = useState<any>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [queue, setQueue] = useState<QueuedJob[]>([])

  /* modals */
  const [openEngineOn, setOpenEngineOn] = useState(false)
  const [openDriverCost, setOpenDriverCost] = useState(false)
  const [openVehicleMaster, setOpenVehicleMaster] = useState(false)
  const [openTripSummary, setOpenTripSummary] = useState(false)
  const [openEtlJobs, setOpenEtlJobs] = useState(false)

  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const runningJob = jobs.find((j) => j.status === "running")

  /* -------- Health -------- */
  useEffect(() => {
    healthz()
      .then(setHealth)
      .catch(() => setHealth({ status: "error" }))
  }, [])

  /* -------- Start next job from queue -------- */
  useEffect(() => {
    if (runningJob || queue.length === 0) return

    const next = queue[0]

    ;(async () => {
      try {
        const res = await next.run()

        // ✅ normalize job_id (backend อาจไม่คืน)
        const jobId =
          res?.job_id ?? `${next.type}-${Date.now()}`

        setJobs((prev) =>
          prev.map((j) =>
            j.status === "queued" && j.type === next.type
              ? {
                  ...j,
                  jobId,
                  status: "running",
                  startedAt: new Date().toISOString(),
                }
              : j
          )
        )

        setQueue((q) => q.slice(1))
      } catch (e: any) {
        setJobs((prev) =>
          prev.map((j) =>
            j.status === "queued" && j.type === next.type
              ? {
                  ...j,
                  status: "failed",
                  message: e?.message ?? "Failed to start",
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
    if (!runningJob || !runningJob.jobId) return

    pollingRef.current = setInterval(async () => {
      let res: any

      switch (runningJob.type) {
        case "engineon":
          res = await engineOnStatus(runningJob.jobId)
          break
        case "drivercost":
          res = await driverCostStatus(runningJob.jobId)
          break
        case "vehiclemaster":
          res = await vehicleMasterStatus(runningJob.jobId)
          break
        case "engineon-trip-summary":
          res = await engineOnTripSummaryStatus(runningJob.jobId)
          break
      }

      if (res?.status === "success" || res?.status === "failed") {
        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === runningJob.jobId
              ? {
                  ...j,
                  status: res.status,
                  finishedAt: new Date().toISOString(),
                  message: res.error,
                }
              : j
          )
        )
      }
    }, 5000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [runningJob])

  /* -------- Enqueue helper -------- */
  const enqueue = (job: QueuedJob) => {
    setJobs((prev) => [
      {
        type: job.type,
        name: job.name,
        status: "queued",
      },
      ...prev,
    ])

    setQueue((q) => [...q, job])
  }

  /* ---------------- Render ---------------- */

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold">🧭 ETL Pipeline Control</h1>
        <p className="text-sm text-gray-600">
          Queue based • Auto run • Timeline
        </p>
      </header>

      {/* Health + ETL Jobs */}
      <section className="bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div>
          Health:{" "}
          <span
            className={
              health?.status === "ok"
                ? "text-green-600"
                : "text-red-600"
            }
          >
            {health?.status ?? "unknown"}
          </span>
        </div>

        <Button variant="outline" onClick={() => setOpenEtlJobs(true)}>
          📄 View ETL Jobs
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
          {jobs.map((j, i) => (
            <li key={`${j.type}-${i}`} className="p-4 flex justify-between">
              <div>
                <div className="font-medium">{j.name}</div>
                <div className="text-xs text-gray-500">
                  {j.status === "queued" && "⏳ Queued"}
                  {j.startedAt &&
                    `Started ${dayjs(j.startedAt).fromNow()}`}
                </div>
                {j.message && (
                  <div className="text-xs text-red-600">{j.message}</div>
                )}
              </div>
              <StatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      </section>

      {/* Modals */}
      <RunEngineOnModal
        open={openEngineOn}
        onClose={() => setOpenEngineOn(false)}
        onRun={(run) =>
          enqueue({ type: "engineon", name: "Engine-On ETL", run })
        }
      />

      <RunDriverCostModal
        open={openDriverCost}
        onClose={() => setOpenDriverCost(false)}
        onRun={(run) =>
          enqueue({ type: "drivercost", name: "Driver Cost ETL", run })
        }
      />

      <RunVehicleMasterModal
        open={openVehicleMaster}
        onClose={() => setOpenVehicleMaster(false)}
        onRun={(run) =>
          enqueue({ type: "vehiclemaster", name: "Vehicle Master ETL", run })
        }
      />

      <RunTripSummaryModal
        open={openTripSummary}
        onClose={() => setOpenTripSummary(false)}
        onRun={(run) =>
          enqueue({
            type: "engineon-trip-summary",
            name: "Engine-On Trip Summary",
            run,
          })
        }
      />

      <EtlJobsModal
        open={openEtlJobs}
        onClose={() => setOpenEtlJobs(false)}
      />
    </div>
  )
}

/* ---------------- Badge ---------------- */

function StatusBadge({ status }: { status: JobStatus }) {
  if (status === "queued")
    return <span className="text-gray-500">⏳ Queued</span>
  if (status === "running")
    return <span className="text-yellow-600">🟡 Running</span>
  if (status === "success")
    return <span className="text-green-600">🟢 Success</span>
  return <span className="text-red-600">🔴 Failed</span>
}
