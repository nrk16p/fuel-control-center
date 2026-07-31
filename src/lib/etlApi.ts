/**
 * ETL API client — talks to api-ncac's pipeline framework through the
 * server-side proxy at /api/pipeline/[type] (which holds the x-api-key).
 *
 * Job model: POST returns { job_id: "<type>:<triggerMs>" }. Status polling hits
 * GET /api/pipeline/{type} → { running, last_run } (last_run = analytics.etl_jobs doc)
 * and reports success/failed once a job-log created after the trigger completes.
 */

type UiJobType = "engineon" | "drivercost" | "vehiclemaster" | "engineon-trip-summary"

/** how long we wait for the subprocess to write its job log before failing */
const START_GRACE_MS = 60_000
/** clock-skew slack when matching last_run.created_at against trigger time */
const SKEW_MS = 60_000

/* -----------------------------
   Health
------------------------------ */
export async function healthz() {
  const res = await fetch("/api/pipeline/health", { cache: "no-store" })
  if (!res.ok) throw new Error(`Healthz failed: ${res.status}`)
  return res.json()
}

/* -----------------------------
   Trigger + status core
------------------------------ */
async function trigger(type: UiJobType, payload?: Record<string, unknown>) {
  const res = await fetch(`/api/pipeline/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Trigger failed (${res.status})`)
  if (data?.status === "already_running") {
    throw new Error("Pipeline is already running — wait for it to finish")
  }
  return data as { job_id: string }
}

async function status(type: UiJobType, jobId: string) {
  const triggeredAt = Number(jobId.split(":").pop()) || 0

  const res = await fetch(`/api/pipeline/${type}`, { cache: "no-store" })
  const data = await res.json()

  if (data?.running) return { status: "running" }

  const lastRun = data?.last_run
  const createdAt = lastRun?.created_at ? Date.parse(lastRun.created_at) : 0

  // job log written after our trigger → that's our run
  if (lastRun && createdAt >= triggeredAt - SKEW_MS) {
    return {
      status: lastRun.status, // "running" | "success" | "failed"
      error: lastRun.error ?? undefined,
      job_id: lastRun._id,
      rows: lastRun.rows,
    }
  }

  // not running, no fresh job log — either still spawning or it died before logging
  if (Date.now() - triggeredAt > START_GRACE_MS) {
    return { status: "failed", error: "Pipeline did not start (no job log) — check api-ncac logs" }
  }
  return { status: "running" }
}

/* ---------------- Engine-On ---------------- */
export async function runEngineOn(payload: {
  start_date: string
  end_date: string
  max_distance?: number
  save_raw?: boolean
  save_summary?: boolean
}) {
  return trigger("engineon", payload)
}

export async function engineOnStatus(jobId: string) {
  return status("engineon", jobId)
}

/* ---------------- Driver Cost (ticket) ---------------- */
export async function runDriverCost(payload: { year: string; month: string }) {
  return trigger("drivercost", payload)
}

export async function driverCostStatus(jobId: string) {
  return status("drivercost", jobId)
}

/* ---------------- Vehicle Master ---------------- */
export async function runVehicleMaster(_payload?: Record<string, unknown>) {
  // auto-login on the backend — no phpsessid needed anymore
  return trigger("vehiclemaster")
}

export async function vehicleMasterStatus(jobId: string) {
  return status("vehiclemaster", jobId)
}

/* ---------------- Engine-On Trip Summary ---------------- */
export async function runEngineOnTripSummary(payload: {
  year: number
  month: number
  version_type?: string | null
}) {
  return trigger("engineon-trip-summary", payload)
}

export async function engineOnTripSummaryStatus(jobId: string) {
  return status("engineon-trip-summary", jobId)
}
