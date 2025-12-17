const API_BASE =
  process.env.NEXT_PUBLIC_ETL_API_BASE ??
  "https://api-engineon.onrender.com"


/* -----------------------------
   Health
------------------------------ */
export async function healthz() {
  const res = await fetch(`${API_BASE}/healthz`, {
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Healthz failed: ${res.status}`)
  }

  return res.json()
}

/* ---------------- Engine-On ---------------- */
export async function runEngineOn(payload: {
  start_date: string
  end_date: string
  max_distance?: number
  save_raw?: boolean
  save_summary?: boolean
}) {
  return fetch(`${API_BASE}/engineon/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json())
}

export async function engineOnStatus(jobId: string) {
  return fetch(`${API_BASE}/engineon/status/${jobId}`).then((r) =>
    r.json()
  )
}

/* ---------------- Driver Cost ---------------- */
export async function runDriverCost(payload: {
  year: string
  month: string
}) {
  return fetch(`${API_BASE}/drivercost/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json())
}

export async function driverCostStatus(jobId: string) {
  return fetch(`${API_BASE}/drivercost/status/${jobId}`).then((r) =>
    r.json()
  )
}

/* ---------------- Vehicle Master ---------------- */
// src/lib/etlApi.ts
export interface VehicleMasterRunPayload {
  phpsessid?: string
  base_url?: string
  db_name?: string
  collection_name?: string
}

export async function runVehicleMaster(
  payload: VehicleMasterRunPayload
) {
  const res = await fetch(`${API_BASE}/vehiclemaster/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.json()
    throw err
  }

  return res.json()
}

export async function vehicleMasterStatus(jobId: string) {
  return fetch(`${API_BASE}/vehiclemaster/status/${jobId}`).then((r) =>
    r.json()
  )
}

/* ---------------- Engine-On Trip Summary ---------------- */
export async function runEngineOnTripSummary(payload: {
  year: number
  month: number
  version_type?: string | null
}) {
  return fetch(`${API_BASE}/engineon-trip-summary/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json())
}

export async function engineOnTripSummaryStatus(jobId: string) {
  return fetch(
    `${API_BASE}/engineon-trip-summary/status/${jobId}`
  ).then((r) => r.json())
}
