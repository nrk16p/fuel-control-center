// src/app/engineon/components/types.ts

export interface EngineTripSummary {
  _id: string

  // ───────── Basic ─────────
  Supervisor?: string
  TruckPlateNo: string
  Date: string

  // ───────── Engine-On (Plant) ─────────
  TotalMinutes: number                 // นาที (plant)
  Duration_str: string                 // HH:mm:ss (plant)

  // ───────── Engine-On (Not Plant) ─────────
  total_engine_on_min_not_plant?: number  // นาที (not plant)
  not_plant_hhmm?: string                 // HH:mm:ss (not plant)

  // ───────── Trip / Fuel (Plant) ─────────
  "#trip": number
  "จำนวนลิตร"?: number                  // fuel loss (plant)

  // ───────── Fuel (Not Plant) ─────────
  not_plant_liter?: number               // fuel loss (not plant)

  // ───────── Version / Time ─────────
  version_type: string
  year: number
  month: number

  // ───────── Extra (used in UI) ─────────
  "สำรองเวลาโหลด"?: number              // นาที
  "ส่วนต่าง"?: number                   // นาที
  "ส่วนต่าง_hhmm"?: string              // HH:mm:ss
}

/* ───────── Sorting keys ───────── */

export type SortKey =
  | "Supervisor"
  | "TruckPlateNo"
  | "Date"
  | "TotalMinutes"
  | "#trip"
  | "จำนวนลิตร"
  | "total_engine_on_min_not_plant"
  | "not_plant_liter"
